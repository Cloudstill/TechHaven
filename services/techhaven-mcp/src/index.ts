#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { verifyAgentToken } from "./auth/agentToken.js";
import { MockTechHavenClient } from "./techhaven/mockClient.js";
import { HttpTechHavenClient } from "./techhaven/httpClient.js";
import { AuditLog } from "./audit.js";
import { registerTools } from "./tools/index.js";
import { MockSemanticsProvider } from "./semantics/mockProvider.js";
import { log } from "./log.js";

const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const config = loadConfig();

  const verified = verifyAgentToken(config.agentToken, config.tokenSecret);
  if (!verified.ok) {
    log("agent token 校验失败：", verified.reason);
    process.exit(1);
  }
  const session = verified.payload;

  const client =
    config.backend === "http"
      ? new HttpTechHavenClient({ apiBaseUrl: config.apiBaseUrl, serviceToken: config.serviceToken })
      : new MockTechHavenClient();

  // 审计：JSONL 永远是主审计；TECHHAVEN_DB_URL 非空时尝试启用 PostgreSQL 双写
  let audit: AuditLog;
  if (config.dbUrl) {
    const { DbAuditSink } = await import("./audit/dbSink.js");
    const sink = new DbAuditSink(
      config.dbUrl,
      config.agentName,
      session.org,
      session.sid,
      SERVER_VERSION,
    );
    if (await sink.init()) {
      audit = new AuditLog(config.auditFile, sink);
      log(`DB 双写已启用（identity=${config.agentName} sid=${session.sid} org=${session.org}）`);
    } else {
      audit = new AuditLog(config.auditFile);
      log("警告：DB 双写初始化失败，本次会话仅写 JSONL 审计");
    }
  } else {
    audit = new AuditLog(config.auditFile);
  }

  // 语义层：P0 用人工策展的 mock 数据源；接入真实后端后替换为远程语义 Provider
  const semantics = new MockSemanticsProvider();

  const server = new McpServer({ name: "techhaven-mcp", version: SERVER_VERSION });
  registerTools(server, { client, session, audit, semantics });

  await server.connect(new StdioServerTransport());
  log(
    `已连接（mode=${config.backend} sid=${session.sid} org=${session.org} scopes=${session.scopes.join(",")}）`,
  );
}

main().catch((err) => {
  log("启动失败:", err);
  process.exit(1);
});

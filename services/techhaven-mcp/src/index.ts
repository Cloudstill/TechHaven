#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { verifyAgentToken } from "./auth/agentToken.js";
import { MockTechHavenClient } from "./techhaven/mockClient.js";
import { HttpTechHavenClient } from "./techhaven/httpClient.js";
import { AuditLog } from "./audit.js";
import { ProposalStore } from "./proposals/store.js";
import { registerTools } from "./tools/index.js";
import { MockSemanticsProvider } from "./semantics/mockProvider.js";
import type { SemanticsProvider } from "./semantics/types.js";
import type { PgContext } from "./db/context.js";
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

  // P2 持久化：TECHHAVEN_DB_URL 非空时建立 DB 会话上下文（pool + agent_identities/agent_sessions 锚点），
  // 审计双写 / 写提案落库 / 语义层 DB Provider 三者共用；失败整体降级为
  // 「仅 JSONL 审计 + mock 语义层 + 提案只落 JSONL」。pg 依赖只在此分支惰性加载。
  let ctx: PgContext | null = null;
  if (config.dbUrl) {
    const { PgContext } = await import("./db/context.js");
    try {
      ctx = await PgContext.create(config.dbUrl, config.agentName, session.org, session.sid, SERVER_VERSION);
      log(`DB 已连接（identity=${config.agentName} sid=${session.sid} org=${session.org}）`);
    } catch {
      // 错误细节已在 PgContext.create 里记过 stderr；这里只提示降级
      log("警告：DB 初始化失败，本次会话降级为仅 JSONL 审计 + mock 语义层");
    }
  }

  // 审计：JSONL 永远是主审计；DB 就绪时双写 agent_tool_calls
  let audit: AuditLog;
  // 语义层：DB 就绪时读 semantic_* 表（数据需人工策展，查无即 notFound）；否则用人工策展 mock。
  // 接入真实后端语义接口后，再替换为远程 Provider（接口不变）
  let semantics: SemanticsProvider;
  // 写提案存储（staged 写模式：提案暂存 → 人批 → 应用；direct 模式下仅构造不使用）。
  // JSONL 事件流是权威存储（server 与人工 CLI 靠它交接）；DB 就绪时镜像 agent_write_proposals 表
  let proposals: ProposalStore;

  if (ctx) {
    const { DbAuditSink } = await import("./audit/dbSink.js");
    const { ProposalDbSink } = await import("./proposals/dbSink.js");
    const { DbSemanticsProvider } = await import("./semantics/dbProvider.js");
    audit = new AuditLog(config.auditFile, new DbAuditSink(ctx));
    semantics = new DbSemanticsProvider({ ctx, orgId: session.org });
    proposals = new ProposalStore(config.proposalsFile, config.proposalTtlMinutes, new ProposalDbSink(ctx));
    log("DB 已启用：审计双写（agent_tool_calls）+ 写提案落库（agent_write_proposals）+ 语义层 DB Provider（semantic_*）");
  } else {
    audit = new AuditLog(config.auditFile);
    semantics = new MockSemanticsProvider();
    proposals = new ProposalStore(config.proposalsFile, config.proposalTtlMinutes);
  }

  const server = new McpServer({ name: "techhaven-mcp", version: SERVER_VERSION });
  registerTools(server, {
    client,
    session,
    audit,
    semantics,
    proposals,
    writeMode: config.writeMode,
    stagedTools: config.stagedTools,
  });

  await server.connect(new StdioServerTransport());
  log(
    `已连接（mode=${config.backend} write=${config.writeMode} sid=${session.sid} org=${session.org} scopes=${session.scopes.join(",")}）`,
  );
}

main().catch((err) => {
  log("启动失败:", err);
  process.exit(1);
});

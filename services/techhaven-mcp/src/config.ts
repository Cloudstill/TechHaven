export type BackendMode = "mock" | "http";

export interface Config {
  agentToken: string;
  tokenSecret: string;
  backend: BackendMode;
  apiBaseUrl: string;
  serviceToken: string;
  auditFile: string;
  /** PostgreSQL 连接串（TECHHAVEN_DB_URL）；空串 = 不启用 DB 审计双写，JSONL 审计为主 */
  dbUrl: string;
  /** agent 身份在 DB（agent_identities.name）中的名字（TECHHAVEN_AGENT_NAME） */
  agentName: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const agentToken = env.TECHHAVEN_AGENT_TOKEN?.trim() ?? "";
  if (!agentToken) {
    throw new ConfigError("缺少 TECHHAVEN_AGENT_TOKEN（用 `npm run token -- issue ...` 签发后注入）");
  }
  const tokenSecret = env.TECHHAVEN_TOKEN_SECRET?.trim() ?? "";
  if (!tokenSecret) {
    throw new ConfigError("缺少 TECHHAVEN_TOKEN_SECRET");
  }

  const backendRaw = (env.TECHHAVEN_BACKEND ?? "mock").trim().toLowerCase();
  if (backendRaw !== "mock" && backendRaw !== "http") {
    throw new ConfigError(`TECHHAVEN_BACKEND 只能是 mock | http，收到：${backendRaw}`);
  }
  const backend = backendRaw as BackendMode;

  const apiBaseUrl = env.TECHHAVEN_API_BASE_URL?.trim() || "https://techhaven.website";
  const serviceToken = env.TECHHAVEN_SERVICE_TOKEN?.trim() ?? "";
  if (backend === "http" && !serviceToken) {
    throw new ConfigError("http 模式需要 TECHHAVEN_SERVICE_TOKEN（服务端凭据，不使用 agent token）");
  }

  return {
    agentToken,
    tokenSecret,
    backend,
    apiBaseUrl,
    serviceToken,
    auditFile: env.TECHHAVEN_AUDIT_FILE?.trim() || "./audit/agent-audit.jsonl",
    dbUrl: env.TECHHAVEN_DB_URL?.trim() ?? "",
    agentName: env.TECHHAVEN_AGENT_NAME?.trim() || "techhaven-mcp-poc",
  };
}

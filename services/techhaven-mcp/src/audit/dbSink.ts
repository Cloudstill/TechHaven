import type { AuditEntry } from "../audit.js";
import type { PgContext } from "../db/context.js";
import { log } from "../log.js";

/**
 * PostgreSQL 审计双写 sink（对应 docs/agent-db/schema.sql §3 agent_tool_calls）。
 *
 * 定位：JSONL 审计（src/audit.ts）仍是唯一权威来源，DB 双写是可选增强；
 * 任何失败都只记 stderr，绝不影响主流程（fire-and-forget，绝不抛出）。
 *
 * 连接与身份 bootstrap 已上移到 PgContext（P2 起与提案落库 / 语义层 DB Provider 共用
 * 同一个 pool），这里只负责 INSERT；PgContext 未就绪时不会构造本类。
 */
export class DbAuditSink {
  constructor(private ctx: PgContext) {}

  /** 写一条审计；绝不抛出，失败记 stderr */
  async append(entry: AuditEntry): Promise<void> {
    try {
      // org_id 取条目自身：guard 记录时 base.org 恒为 ctx.session.org，与 bootstrap 的会话同源
      await this.ctx.pool.query(
        `INSERT INTO agent_tool_calls
           (session_id, identity_id, org_id, tool_name, args_digest, decision, deny_reason, risk_level, latency_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.ctx.sessionId,
          this.ctx.identityId,
          entry.org,
          entry.tool,
          entry.argsDigest,
          entry.decision,
          entry.decision === "deny" ? (entry.reason ?? null) : null,
          entry.decision === "deny" ? "medium" : "low",
          entry.latencyMs,
          entry.ts,
        ],
      );
    } catch (err) {
      log("DB 审计写入失败:", err);
    }
  }
}

import pg from "pg";
import type { AuditEntry } from "../audit.js";
import { log } from "../log.js";

/**
 * PostgreSQL 审计双写 sink（对应 techhaven-agent-db/schema.sql §3 agent_tool_calls）。
 *
 * 定位：JSONL 审计（src/audit.ts）仍是唯一权威来源，DB 双写是可选增强；
 * 任何失败都只记 stderr，绝不影响主流程（fire-and-forget，绝不抛出）。
 */
export class DbAuditSink {
  private pool: pg.Pool | null = null;
  /** BIGINT 在 node-pg 中默认解析为 string（防精度丢失），缓存为 string 原样回传即可 */
  private identityId: string | null = null;
  private sessionId: string | null = null;

  constructor(
    private dbUrl: string,
    private agentName: string,
    private orgId: number,
    private sid: string,
    private engineVersion: string,
  ) {}

  /** 建立连接并 bootstrap：返回是否成功（失败=放弃 DB 双写，返回 false） */
  async init(): Promise<boolean> {
    this.pool = new pg.Pool({
      connectionString: this.dbUrl,
      max: 1, // 单连接足够：审计为串行低频写入
      connectionTimeoutMillis: 5000, // 网络黑洞时快速失败，避免启动期挂死
    });
    try {
      // created_by=0：P0 阶段 MCP 进程无登录上下文，用 0 作为哨兵值占位
      // （真实签发人要等 P1 由 Gateway 下发后回填）
      const identity = await this.pool.query<{ id: string }>(
        `INSERT INTO agent_identities (org_id, name, kind, created_by)
         VALUES ($1, $2, 'assistant', 0)
         ON CONFLICT (org_id, name) DO UPDATE SET status = 'active'
         RETURNING id`,
        [this.orgId, this.agentName],
      );
      if (identity.rows.length === 0) {
        throw new Error("agent_identities upsert 未返回 id");
      }
      this.identityId = identity.rows[0].id;

      const session = await this.pool.query<{ id: string }>(
        `INSERT INTO agent_sessions
           (sid, identity_id, org_id, engine, engine_version, profile, status, started_at)
         VALUES ($1, $2, $3, 'dsh', $4, 'p0', 'running', now())
         ON CONFLICT (sid) DO UPDATE SET status = 'running', started_at = now()
         RETURNING id`,
        [this.sid, this.identityId, this.orgId, this.engineVersion],
      );
      if (session.rows.length === 0) {
        throw new Error("agent_sessions upsert 未返回 id");
      }
      this.sessionId = session.rows[0].id;
      return true;
    } catch (err) {
      log("DB 审计初始化失败，放弃 DB 双写（JSONL 审计不受影响）:", err);
      await this.close();
      return false;
    }
  }

  /** 写一条审计；绝不抛出，失败记 stderr */
  async append(entry: AuditEntry): Promise<void> {
    try {
      if (!this.pool || this.sessionId === null || this.identityId === null) {
        return; // init 未成功（或已放弃）→ 静默跳过 DB 双写
      }
      await this.pool.query(
        `INSERT INTO agent_tool_calls
           (session_id, identity_id, org_id, tool_name, args_digest, decision, deny_reason, risk_level, latency_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.sessionId,
          this.identityId,
          this.orgId,
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

  /** 释放连接池（仅 init 失败路径使用；正常生命周期随进程退出） */
  private async close(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    if (!pool) return;
    try {
      await pool.end();
    } catch {
      // 关闭失败不影响主流程
    }
  }
}

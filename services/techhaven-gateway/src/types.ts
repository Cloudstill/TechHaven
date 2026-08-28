/**
 * 引擎驱动接口契约（TH-RFC-001 §05.1）。
 * 本文件为 Gateway 与引擎驱动（drivers/mock.ts 以及另一位同事交付的 drivers/dsh.ts）
 * 的共享契约：以下定义逐字冻结，改动需双方同步评审。
 */

export type SessionStatus = "queued" | "running" | "awaiting_permission" | "succeeded" | "failed" | "cancelled";

export type EngineEvent =
  | { type: "assistant_chunk"; seq: number; ts: string; text: string }
  | { type: "tool_call";      seq: number; ts: string; tool: string; argsDigest: string; args?: unknown }
  | { type: "tool_result";    seq: number; ts: string; tool: string; ok: boolean; summary?: string }
  | { type: "permission_request"; seq: number; ts: string; requestId: string; tool: string; reason?: string }
  | { type: "status_change";  seq: number; ts: string; status: SessionStatus; detail?: string }
  | { type: "error";          seq: number; ts: string; message: string };

export interface EngineSessionHandle {
  events(): AsyncIterable<EngineEvent>;                       // 会话全量事件流（含历史回放）
  send(text: string): Promise<void>;
  answerPermission(requestId: string, decision: "approve" | "reject", note?: string): Promise<void>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}
export interface EngineDriver {
  readonly name: string;
  startSession(opts: { sessionId: string; orgId: number; prompt: string; profile?: string }): Promise<EngineSessionHandle>;
  dispose(): Promise<void>;
}

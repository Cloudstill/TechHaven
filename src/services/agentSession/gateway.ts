import { AgentGatewayClient } from "../agentGatewayClient";
import type { EngineEvent, EventEnvelope } from "../../contracts/agent";
import type { SessionHandle, EngineEventListener } from "./types";

/** 事件信封 → 面板 UI 事件（seq/ts 还原自信封；payload 为契约可辨识联合） */
const toUiEvent = (env: EventEnvelope): EngineEvent => {
  const { seq, type, occurredAt, payload } = env;
  switch (type) {
    case "assistant_chunk":
      return { type, seq, ts: occurredAt, text: payload.text };
    case "tool_call":
      return { type, seq, ts: occurredAt, tool: payload.tool, argsDigest: payload.argsDigest, args: payload.args };
    case "tool_result":
      return { type, seq, ts: occurredAt, tool: payload.tool, ok: payload.ok, summary: payload.summary };
    case "permission_request":
      return { type, seq, ts: occurredAt, requestId: payload.requestId, tool: payload.tool, reason: payload.reason };
    case "proposal_lifecycle":
      return {
        type,
        seq,
        ts: occurredAt,
        event: payload.event,
        actor: payload.actor,
        proposal: payload.proposal,
        note: payload.note,
      };
    case "status_change":
      return { type, seq, ts: occurredAt, status: payload.status, detail: payload.detail };
    case "error":
      return { type, seq, ts: occurredAt, message: payload.message };
  }
};

/** React StrictMode 会短暂双挂载 DEV 页面；共享创建 Promise，避免并发 POST 生成两场会话。 */
let gatewayCreateInFlight: Promise<string> | null = null;

/**
 * 真实 Gateway 会话（driver=gateway）：创建会话 → SSE 订阅事件信封印 → UI 事件；
 * 审批/取消经 HTTP API 转发。POST 鉴权头由 Vite 代理注入（浏览器不持有网关 token）。
 */
export function createGatewaySession(onSid: (sid: string) => void): SessionHandle {
  const checkpointKey = "techhaven:dev-agent-session";
  const client = new AgentGatewayClient();
  const listeners = new Set<EngineEventListener>();
  let disposed = false;
  let disposeStream: (() => void) | null = null;
  let proposalPoll: number | null = null;
  let proposalPollFailed = false;
  let sessionTerminal = false;
  let syntheticSeq = 9000; // 本地合成事件（连接失败等）独立编号，避免与流内 seq 冲突
  let sid = "";

  const readCheckpoint = (): string => {
    try {
      return window.sessionStorage.getItem(checkpointKey) ?? "";
    } catch {
      return "";
    }
  };
  const writeCheckpoint = (value: string): void => {
    try {
      if (value) window.sessionStorage.setItem(checkpointKey, value);
      else window.sessionStorage.removeItem(checkpointKey);
    } catch {
      // 禁用 storage 时退化为每次新建会话；不影响主链路
    }
  };

  const emit = (event: EngineEvent) => {
    if (!disposed) listeners.forEach((listener) => listener(event));
  };
  const emitError = (message: string) => {
    emit({ type: "error", seq: ++syntheticSeq, ts: new Date().toISOString(), message });
  };
  const emitConnectionFailure = (message: string) => {
    emitError(message);
    emit({ type: "status_change", seq: ++syntheticSeq, ts: new Date().toISOString(), status: "failed" });
  };

  const handle: SessionHandle = {
    sid,
    start() {
      void (async () => {
        try {
          let targetSid = readCheckpoint();
          if (targetSid) {
            const previous = await client.getSession(targetSid).catch(() => null);
            if (!previous || ["succeeded", "failed", "cancelled"].includes(previous.status)) {
              writeCheckpoint("");
              targetSid = "";
            }
          }
          if (!targetSid) {
            if (!gatewayCreateInFlight) {
              gatewayCreateInFlight = client
                .createSession({
                  orgId: 1,
                  subjectType: "bug",
                  subjectId: "bug_1",
                  prompt: "演示：读取缺陷 bug_1 并分析，如需修复请先申请权限。",
                })
                .then((created) => created.sid)
                .finally(() => {
                  gatewayCreateInFlight = null;
                });
            }
            targetSid = await gatewayCreateInFlight;
            writeCheckpoint(targetSid);
          }
          if (disposed) {
            // React StrictMode/HMR/页面卸载都可能在异步创建完成前释放本观察端；
            // 此处只停止接线，不把观察端生命周期误判为用户取消。下一挂载可凭 checkpoint 恢复。
            return;
          }
          sid = targetSid;
          handle.sid = targetSid;
          onSid(targetSid);
          // 刷新后全量回放当前会话，重建审批卡与历史；同一页面内断线仍由 client 按 after=<lastSeq> 增量续传。
          disposeStream = client.subscribeEvents(targetSid, {
            onEvent: (env) => {
              if (env.type === "status_change" && ["succeeded", "failed", "cancelled"].includes(env.payload.status)) {
                sessionTerminal = true;
                writeCheckpoint("");
                gatewayCreateInFlight = null;
              }
              emit(toUiEvent(env));
            },
            onProtocolError: (message) => emitError(`网关事件协议错误：${message}`),
            onEnd: (reason) => {
              if (disposed) return;
              if (reason === "failed") emitConnectionFailure("Agent 服务连接已中断，请稍后重试。其他页面仍可正常使用。");
            },
          });
          const syncProposals = async (): Promise<void> => {
            try {
              const result = await client.listProposals(targetSid);
              proposalPollFailed = false;
              if (sessionTerminal && result.proposals.every((item) => !["pending", "approved"].includes(item.status))) {
                if (proposalPoll !== null) window.clearInterval(proposalPoll);
                proposalPoll = null;
              }
            } catch (err) {
              if (!proposalPollFailed && !disposed) {
                proposalPollFailed = true;
                emitError(`提案同步失败：${err instanceof Error ? err.message : String(err)}`);
              }
            }
          };
          void syncProposals();
          proposalPoll = window.setInterval(() => void syncProposals(), 1000);
        } catch (err) {
          if (disposed) return;
          emitConnectionFailure(err instanceof Error ? err.message : "Agent 服务暂时不可用，请稍后重试。");
        }
      })();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    answerPermission(requestId, decision) {
      void client
        .answerPermission(sid || handle.sid, requestId, decision)
        .catch((err) => emitError(`Runner 权限应答失败：${err instanceof Error ? err.message : String(err)}`));
    },
    async decideProposal(proposalId, decision, note) {
      try {
        await client.decideProposal(sid || handle.sid, proposalId, decision, note);
      } catch (err) {
        const message = `产品提案审批失败：${err instanceof Error ? err.message : String(err)}`;
        emitError(message);
        throw err;
      }
    },
    cancel() {
      writeCheckpoint("");
      gatewayCreateInFlight = null;
      if (sid) void client.cancel(sid).catch(() => undefined);
    },
    dispose() {
      disposed = true;
      if (proposalPoll !== null) window.clearInterval(proposalPoll);
      disposeStream?.();
      listeners.clear();
    },
  };
  return handle;
}

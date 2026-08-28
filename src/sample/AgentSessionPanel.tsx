/**
 * Agent 会话面板测试样例页（DEV 专用，TH-RFC-001 §05.4）
 *
 * 用内置 mock 事件流驱动 UI，演示 Agent Gateway 会话面板的完整交互：
 * 状态徽标（queued/running/awaiting_permission/succeeded/failed/cancelled）、
 * 事件流（assistant_chunk / tool_call / tool_result / permission_request / status_change / error）、
 * 以及核心的权限审批卡（批准 / 拒绝 → mock 流继续或取消）。
 *
 * 不真实连接 gateway（POST /v1/sessions 等），真实接线在业务集成阶段完成。
 */
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import SimpleBar from "simplebar-react";
import { FaCheckCircle, FaInfoCircle, FaRedo, FaShieldAlt, FaTimesCircle, FaWrench } from "react-icons/fa";
import Button from "../components/button/Button";
import Avatar from "../components/avatar/Avatar";
import Loading from "../components/loading/Loading";
import Skeleton from "../components/skeleton/Skeleton";
import message from "../components/message/Message";
import styles from "./AgentSessionPanel.module.css";

/**
 * 与 services/techhaven-gateway/src/types.ts 同构的引擎事件契约
 * （TH-RFC-001 §05.1 逐字冻结），仅用于本样例页的 mock 驱动，请勿在业务代码中复用。
 */
export type SessionStatus = "queued" | "running" | "awaiting_permission" | "succeeded" | "failed" | "cancelled";

export type EngineEvent =
  | { type: "assistant_chunk"; seq: number; ts: string; text: string }
  | { type: "tool_call"; seq: number; ts: string; tool: string; argsDigest: string; args?: unknown }
  | { type: "tool_result"; seq: number; ts: string; tool: string; ok: boolean; summary?: string }
  | { type: "permission_request"; seq: number; ts: string; requestId: string; tool: string; reason?: string }
  | { type: "status_change"; seq: number; ts: string; status: SessionStatus; detail?: string }
  | { type: "error"; seq: number; ts: string; message: string };

type PermissionDecision = "approve" | "reject";

type EngineEventListener = (event: EngineEvent) => void;

interface MockSessionHandle {
  sid: string;
  start(): void;
  subscribe(listener: EngineEventListener): () => void;
  answerPermission(requestId: string, decision: PermissionDecision, note?: string): void;
  dispose(): void;
}

/** 状态 → 徽标语义色映射（见 .module.css 中 badge--* 类） */
const STATUS_TONE: Record<SessionStatus, "neutral" | "running" | "warning" | "success" | "danger"> = {
  queued: "neutral",
  running: "running",
  awaiting_permission: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "danger",
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  queued: "排队中",
  running: "运行中",
  awaiting_permission: "待审批",
  succeeded: "已成功",
  failed: "已失败",
  cancelled: "已取消",
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 事件间隔 300–600ms，模拟真实流式输出的节奏 */
const randomDelay = () => 300 + Math.floor(Math.random() * 301);

const randomToken = (length: number) => Array.from({ length }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

/**
 * mock 会话数据源：按剧本异步 emit 事件。
 * 剧本：running → chunk → tool_call(get_ticket) → tool_result → chunk
 *   → awaiting_permission → permission_request（挂起等待用户点击）
 *   → [批准] running → tool_call(update_ticket_status) → tool_result → chunk → succeeded
 *   → [拒绝] chunk → cancelled
 */
function createMockSession(): MockSessionHandle {
  const sid = `ses_${randomToken(12)}`;
  const listeners = new Set<EngineEventListener>();
  const decisions = new Map<string, PermissionDecision>();
  const decisionResolvers = new Map<string, () => void>();
  let seq = 0;
  let disposed = false;

  const emit = (event: EngineEvent) => {
    if (disposed) return;
    listeners.forEach((listener) => listener(event));
  };

  const chunk = (text: string) => emit({ type: "assistant_chunk", seq: ++seq, ts: new Date().toISOString(), text });
  const toolCall = (tool: string, argsDigest: string) =>
    emit({ type: "tool_call", seq: ++seq, ts: new Date().toISOString(), tool, argsDigest });
  const toolResult = (tool: string, ok: boolean, summary?: string) =>
    emit({ type: "tool_result", seq: ++seq, ts: new Date().toISOString(), tool, ok, summary });
  const statusChange = (status: SessionStatus, detail?: string) =>
    emit({ type: "status_change", seq: ++seq, ts: new Date().toISOString(), status, detail });

  const waitForDecision = (requestId: string): Promise<PermissionDecision> =>
    new Promise((resolve) => {
      const decided = decisions.get(requestId);
      if (decided) {
        resolve(decided);
        return;
      }
      decisionResolvers.set(requestId, () => resolve(decisions.get(requestId) ?? "reject"));
    });

  const run = async () => {
    statusChange("running", "mock 引擎已接管会话");
    await sleep(randomDelay());
    if (disposed) return;
    chunk("你好，我是 TechHaven 工单助手。已收到请求，正在查询工单 TCK-1024 的详情…");
    await sleep(randomDelay());
    if (disposed) return;
    toolCall("get_ticket", '{"ticketId":"TCK-1024"}');
    await sleep(randomDelay());
    if (disposed) return;
    toolResult("get_ticket", true, "已取到工单：Safari 15+ 打开登录页白屏，当前状态=待处理");
    await sleep(randomDelay());
    if (disposed) return;
    chunk("已读取工单详情。接下来我需要把工单状态更新为「处理中」，该操作会同步通知工单提交人。");
    await sleep(randomDelay());
    if (disposed) return;
    statusChange("awaiting_permission", "引擎请求人工审批");
    const requestId = `req_${randomToken(10)}`;
    emit({
      type: "permission_request",
      seq: ++seq,
      ts: new Date().toISOString(),
      requestId,
      tool: "update_ticket_status",
      reason: "将工单 TCK-1024 的状态由「待处理」变更为「处理中」，需要人工确认后才执行。",
    });

    const decision = await waitForDecision(requestId);
    if (disposed) return;
    if (decision === "approve") {
      // 状态机（图 2）：awaiting_permission --批准--> running --> succeeded
      statusChange("running", "已批准，继续执行");
      await sleep(randomDelay());
      if (disposed) return;
      toolCall("update_ticket_status", '{"ticketId":"TCK-1024","status":"in_progress"}');
      await sleep(randomDelay());
      if (disposed) return;
      toolResult("update_ticket_status", true, "工单状态已更新为「处理中」，已通知提交人");
      await sleep(randomDelay());
      if (disposed) return;
      chunk("工单 TCK-1024 已进入「处理中」状态。如需我继续跟进或回写备注，请随时告知。");
      await sleep(randomDelay());
      if (disposed) return;
      statusChange("succeeded", "任务全部完成");
    } else {
      await sleep(randomDelay());
      if (disposed) return;
      chunk("好的，本次状态变更已取消，工单 TCK-1024 保持「待处理」不变。");
      await sleep(randomDelay());
      if (disposed) return;
      statusChange("cancelled", "用户拒绝了权限请求");
    }
  };

  return {
    sid,
    start() {
      void run();
    },
    subscribe(listener: EngineEventListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    answerPermission(requestId: string, decision: PermissionDecision) {
      decisions.set(requestId, decision);
      const resolve = decisionResolvers.get(requestId);
      if (resolve) {
        decisionResolvers.delete(requestId);
        resolve();
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
      decisionResolvers.clear();
    },
  };
}

const formatTime = (ts: string) => {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false });
};

const SampleAgentSessionPanel: React.FC = () => {
  // runId 变化时重开一场 mock 会话（重新演示）
  const [runId, setRunId] = useState(0);
  const [sid, setSid] = useState("");
  const [status, setStatus] = useState<SessionStatus>("queued");
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PermissionDecision>>({});
  const sessionRef = useRef<MockSessionHandle | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const session = createMockSession();
    sessionRef.current = session;
    setSid(session.sid);
    setStatus("queued");
    setEvents([]);
    setDecisions({});
    const unsubscribe = session.subscribe((event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === "status_change") {
        setStatus(event.status);
      }
    });
    session.start();
    return () => {
      unsubscribe();
      session.dispose();
      sessionRef.current = null;
    };
  }, [runId]);

  // 新事件到达后自动滚到底部
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  const handleRestart = () => {
    setRunId((n) => n + 1);
  };

  const handleDecision = (requestId: string, decision: PermissionDecision) => {
    sessionRef.current?.answerPermission(requestId, decision);
    setDecisions((prev) => ({ ...prev, [requestId]: decision }));
    if (decision === "approve") {
      message.success("已批准工具调用，mock 流继续执行");
    } else {
      message.warn("已拒绝工具调用，会话即将取消");
    }
  };

  const renderEvent = (event: EngineEvent): ReactNode => {
    switch (event.type) {
      case "assistant_chunk":
        return (
          <div className={styles.chunkRow}>
            <Avatar name="TechHaven Agent" size={28} />
            <div className={styles.chunkBody}>
              <div className={styles.chunkBubble}>{event.text}</div>
              <span className={styles.chunkTime}>{formatTime(event.ts)}</span>
            </div>
          </div>
        );
      case "tool_call":
        return (
          <div className={styles.toolCard}>
            <div className={styles.toolHead}>
              <FaWrench aria-hidden="true" />
              <span>工具调用</span>
              <span className={styles.toolName}>{event.tool}</span>
              <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            </div>
            <div className={styles.toolDigest}>{event.argsDigest}</div>
          </div>
        );
      case "tool_result":
        return (
          <div className={`${styles.toolCard} ${event.ok ? styles.toolCardOk : styles.toolCardFail}`}>
            <div className={styles.toolHead}>
              {event.ok ? (
                <FaCheckCircle className={styles.toolIconOk} aria-hidden="true" />
              ) : (
                <FaTimesCircle className={styles.toolIconFail} aria-hidden="true" />
              )}
              <span>{event.ok ? "工具执行成功" : "工具执行失败"}</span>
              <span className={styles.toolName}>{event.tool}</span>
              <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            </div>
            {event.summary && <div className={styles.toolSummary}>{event.summary}</div>}
          </div>
        );
      case "permission_request": {
        const decision = decisions[event.requestId];
        return (
          <div className={styles.permissionCard}>
            <div className={styles.permTitle}>
              <FaShieldAlt aria-hidden="true" />
              <span>权限审批</span>
              <span className={styles.toolName}>{event.tool}</span>
              <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            </div>
            {event.reason && <p className={styles.permReason}>{event.reason}</p>}
            {decision ? (
              <div className={`${styles.permDecision} ${decision === "approve" ? styles.permDecisionOk : styles.permDecisionNo}`}>
                {decision === "approve" ? <FaCheckCircle aria-hidden="true" /> : <FaTimesCircle aria-hidden="true" />}
                <span>{decision === "approve" ? "已批准 · mock 流已继续" : "已拒绝 · 会话已取消"}</span>
              </div>
            ) : (
              <div className={styles.permActions}>
                <Button color="success" size="small" onClick={() => handleDecision(event.requestId, "approve")}>
                  批准
                </Button>
                <Button color="error" variant="outline" size="small" onClick={() => handleDecision(event.requestId, "reject")}>
                  拒绝
                </Button>
              </div>
            )}
          </div>
        );
      }
      case "status_change":
        return (
          <div className={styles.statusRow}>
            <span className={styles.statusLine} />
            <span className={styles.statusName}>状态迁移 → {STATUS_LABEL[event.status]}</span>
            {event.detail && <span className={styles.statusDetail}>{event.detail}</span>}
            <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            <span className={styles.statusLine} />
          </div>
        );
      case "error":
        return (
          <div className={styles.errorRow}>
            <FaTimesCircle aria-hidden="true" />
            <span>{event.message}</span>
            <span className={styles.toolTime}>{formatTime(event.ts)}</span>
          </div>
        );
    }
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Agent 会话面板</h2>
      <p className={styles.desc}>
        Agent Gateway 会话面板样例（TH-RFC-001 §05.4）：演示会话状态徽标、事件流、工具卡片与权限审批交互。 事件类型与{" "}
        <span className={styles.descMono}>services/techhaven-gateway/src/types.ts</span> 的 EngineEvent union 同构，由内置 mock
        会话驱动，未连接真实 gateway。
      </p>

      <section className={styles.panel}>
        <header className={styles.header}>
          <span className={`${styles.badge} ${styles[`badge--${STATUS_TONE[status]}`]}`}>
            <span className={`${styles.badgeDot} ${status === "running" ? styles.badgeDotPulse : ""}`} />
            {STATUS_LABEL[status]}
          </span>
          <span className={styles.sid} title={sid}>
            {sid || "ses_…"}
          </span>
          <span className={styles.spacer} />
          <Button color="secondary" variant="outline" size="small" onClick={handleRestart}>
            <FaRedo aria-hidden="true" />
            重新演示
          </Button>
        </header>

        <div className={styles.stream}>
          <SimpleBar scrollableNodeProps={{ ref: scrollBodyRef }} style={{ maxHeight: 440 }} autoHide={false}>
            <div className={styles.timeline}>
              {events.length === 0 && (
                <div className={styles.streamSkeleton}>
                  <Skeleton variant="text" lines={3} height={14} />
                </div>
              )}
              {events.map((event) => (
                <React.Fragment key={`${event.seq}`}>{renderEvent(event)}</React.Fragment>
              ))}
              {status === "running" && (
                <div className={styles.streamLoadingRow}>
                  <Loading size="small" text="" />
                  <span>mock 引擎输出中…</span>
                </div>
              )}
            </div>
          </SimpleBar>
        </div>

        <footer className={styles.footer}>
          <FaInfoCircle aria-hidden="true" />
          <span>DEV 样例页：真实接线（HTTP + SSE）在业务集成阶段完成。</span>
          <span className={styles.footerMono}>
            POST /v1/sessions · GET /v1/sessions/:sid/events (SSE) · POST /v1/sessions/:sid/permission
          </span>
        </footer>
      </section>
    </div>
  );
};

export default SampleAgentSessionPanel;

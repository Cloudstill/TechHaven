import type { EngineEvent, SessionStatus, ProposalView } from "../../contracts/agent";
import type { SessionHandle, EngineEventListener, PermissionDecision } from "./types";

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
export function createMockSession(onSid: (sid: string) => void): SessionHandle {
  const sid = `ses_${randomToken(12)}`;
  onSid(sid);
  const listeners = new Set<EngineEventListener>();
  const decisions = new Map<string, PermissionDecision>();
  const decisionResolvers = new Map<string, () => void>();
  const proposalDecisions = new Map<string, PermissionDecision>();
  const proposalResolvers = new Map<string, () => void>();
  let seq = 0;
  let disposed = false;
  let proposal: ProposalView | null = null;

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
  const proposalLifecycle = (
    event: "created" | "approved" | "rejected" | "applied" | "expired",
    next: ProposalView,
    actor: string,
    note?: string,
  ) =>
    emit({
      type: "proposal_lifecycle",
      seq: ++seq,
      ts: next.updatedAt,
      event,
      actor,
      proposal: next,
      note,
    });

  const waitForDecision = (requestId: string): Promise<PermissionDecision> =>
    new Promise((resolve) => {
      const decided = decisions.get(requestId);
      if (decided) {
        resolve(decided);
        return;
      }
      decisionResolvers.set(requestId, () => resolve(decisions.get(requestId) ?? "reject"));
    });

  const waitForProposalDecision = (proposalId: string): Promise<PermissionDecision> =>
    new Promise((resolve) => {
      const decided = proposalDecisions.get(proposalId);
      if (decided) {
        resolve(decided);
        return;
      }
      proposalResolvers.set(proposalId, () => resolve(proposalDecisions.get(proposalId) ?? "reject"));
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
    statusChange("awaiting_permission", "runner 请求执行工具权限");
    const requestId = `req_${randomToken(10)}`;
    emit({
      type: "permission_request",
      seq: ++seq,
      ts: new Date().toISOString(),
      requestId,
      tool: "update_ticket_status",
      reason: "runner 请求调用写工具。这里仅决定引擎是否可以发起工具调用，不等于批准产品数据写入。",
    });

    const decision = await waitForDecision(requestId);
    if (disposed) return;
    if (decision === "approve") {
      // 状态机（图 2）：awaiting_permission --批准--> running --> succeeded
      statusChange("running", "runner 权限已批准，继续发起工具调用");
      await sleep(randomDelay());
      if (disposed) return;
      toolCall("update_ticket_status", '{"ticketId":"TCK-1024","status":"in_progress"}');
      await sleep(randomDelay());
      if (disposed) return;
      toolResult("update_ticket_status", true, "已创建产品写提案；工单尚未发生变化");
      await sleep(randomDelay());
      if (disposed) return;
      const createdAt = new Date().toISOString();
      proposal = {
        id: `p_${randomToken(12)}`,
        sessionId: sid,
        orgId: 1,
        tool: "update_ticket_status",
        subjectType: "bug",
        subjectHashId: "TCK-1024",
        fromStatus: "待处理",
        toStatus: "处理中",
        reason: "已确认问题可复现，进入修复处理阶段",
        status: "pending",
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        updatedAt: createdAt,
      };
      proposalLifecycle("created", proposal, "agent");
      const proposalDecision = await waitForProposalDecision(proposal.id);
      if (disposed) return;
      if (proposalDecision === "approve") {
        await sleep(randomDelay());
        if (disposed || !proposal) return;
        proposal = {
          ...proposal,
          status: "applied",
          updatedAt: new Date().toISOString(),
          note: "MCP worker 已重新校验状态机并幂等应用",
        };
        proposalLifecycle("applied", proposal, "system", proposal.note);
        await sleep(randomDelay());
        if (disposed) return;
        chunk("产品写提案已应用，工单 TCK-1024 现在处于「处理中」。");
      } else {
        await sleep(randomDelay());
        if (disposed) return;
        chunk("产品写提案已拒绝；runner 会话可以正常收尾，工单仍保持「待处理」。");
      }
      await sleep(randomDelay());
      if (disposed) return;
      statusChange("succeeded", proposalDecision === "approve" ? "提案已应用" : "提案被拒绝，未写入产品域");
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
    async decideProposal(proposalId: string, decision: PermissionDecision, note?: string) {
      if (!proposal || proposal.id !== proposalId) throw new Error(`未知产品提案：${proposalId}`);
      if (proposal.status !== "pending") return;
      proposalDecisions.set(proposalId, decision);
      proposal = {
        ...proposal,
        status: decision === "approve" ? "approved" : "rejected",
        updatedAt: new Date().toISOString(),
        ...(note ? { note } : {}),
      };
      proposalLifecycle(decision === "approve" ? "approved" : "rejected", proposal, "user:1", note);
      const resolve = proposalResolvers.get(proposalId);
      if (resolve) {
        proposalResolvers.delete(proposalId);
        resolve();
      }
    },
    cancel() {
      disposed = true;
      listeners.clear();
      decisionResolvers.clear();
      proposalResolvers.clear();
    },
    dispose() {
      disposed = true;
      listeners.clear();
      decisionResolvers.clear();
      proposalResolvers.clear();
    },
  };
}

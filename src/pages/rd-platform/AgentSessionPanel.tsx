/**
 * Agent 会话面板（TH-RFC-001 §05.4）
 *
 * 默认用内置 mock 事件流驱动 UI；`?driver=gateway` 经同源代理连接本机 Gateway：
 * 状态徽标（queued/running/awaiting_permission/succeeded/failed/cancelled）、
 * 事件流（assistant/tool/runner permission/product proposal/status/error）、runner 权限卡，
 * 以及独立的产品写提案卡（批准后仍由 MCP worker 重校验并幂等应用）。
 *
 * 当前从研发平台统一入口 `/rd/agent` 访问；真实写入仍受生产 BFF 集成门禁保护。
 */
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import SimpleBar from "simplebar-react";
import { FaBolt, FaCheckCircle, FaCog, FaInfoCircle, FaRedo, FaShieldAlt, FaTimesCircle, FaWrench } from "react-icons/fa";
import Button from "@/components/button/Button";
import Avatar from "@/components/avatar/Avatar";
import Loading from "@/components/loading/Loading";
import Modal from "@/components/modal/Modal";
import Skeleton from "@/components/skeleton/Skeleton";
import message from "@/components/message/Message";
import AgentApiConfigCard from "./AgentApiConfigCard";
import { createGatewaySession } from "@/services/agentSession/gateway";
import { createMockSession } from "@/services/agentSession/mock";
import type { SessionHandle, PermissionDecision } from "@/services/agentSession/types";
import type { EngineEvent as SharedEngineEvent, ProposalStatus, SessionStatus as SharedSessionStatus } from "../../contracts/agent";
import styles from "./AgentSessionPanel.module.css";

/** UI and drivers consume the shared event contract. */
export type SessionStatus = SharedSessionStatus;
export type EngineEvent = SharedEngineEvent;

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

const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  pending: "待产品审批",
  approved: "已批准，等待应用",
  applying: "正在应用，不可撤回",
  rejected: "已拒绝",
  applied: "已应用",
  expired: "已过期",
};

const formatTime = (ts: string) => {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false });
};

const AgentSessionPanel: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isGatewayDriver = searchParams.get("driver") === "gateway";
  // runId 变化时重开一场 mock 会话（重新演示）
  const [runId, setRunId] = useState(0);
  const [sid, setSid] = useState("");
  const [status, setStatus] = useState<SessionStatus>("queued");
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PermissionDecision>>({});
  const [proposalBusy, setProposalBusy] = useState<Record<string, boolean>>({});
  const [configOpen, setConfigOpen] = useState(false);
  const sessionRef = useRef<SessionHandle | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // ?driver=gateway 接真实 Gateway（mock 为默认）；Agent 会话页
    const session = isGatewayDriver ? createGatewaySession(setSid) : createMockSession(setSid);
    sessionRef.current = session;
    setSid(session.sid);
    setStatus("queued");
    setEvents([]);
    setDecisions({});
    setProposalBusy({});
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
  }, [isGatewayDriver, runId]);

  // 新事件到达后自动滚到底部
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  const handleRestart = () => {
    sessionRef.current?.cancel();
    setRunId((n) => n + 1);
  };

  const handleDriverChange = (driver: "mock" | "gateway") => {
    if ((driver === "gateway") === isGatewayDriver) return;

    sessionRef.current?.cancel();
    const nextParams = new URLSearchParams(searchParams);
    if (driver === "gateway") {
      nextParams.set("driver", "gateway");
    } else {
      nextParams.delete("driver");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleDecision = (requestId: string, decision: PermissionDecision) => {
    sessionRef.current?.answerPermission(requestId, decision);
    setDecisions((prev) => ({ ...prev, [requestId]: decision }));
    if (decision === "approve") {
      message.success("已批准工具调用，会话继续执行");
    } else {
      message.warn("已拒绝工具调用，会话即将取消");
    }
  };

  const handleProposalDecision = async (proposalId: string, decision: PermissionDecision): Promise<void> => {
    setProposalBusy((prev) => ({ ...prev, [proposalId]: true }));
    try {
      await sessionRef.current?.decideProposal(proposalId, decision);
      if (decision === "approve") message.success("产品写提案已批准，等待 MCP worker 重新校验并应用");
      else message.warn("产品写提案已拒绝，工单状态不会改变");
    } catch {
      message.error("产品写提案审批失败，请查看事件流中的错误信息");
    } finally {
      setProposalBusy((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  // 生命周期事件保留在 events 计数中；同一提案只渲染最新快照，避免旧 pending 卡仍可点击。
  const visibleEvents = events.filter((event, index) => {
    if (event.type !== "proposal_lifecycle") return true;
    return !events.slice(index + 1).some((next) => next.type === "proposal_lifecycle" && next.proposal.id === event.proposal.id);
  });

  const renderEvent = (event: EngineEvent): ReactNode => {
    switch (event.type) {
      case "assistant_chunk":
        return (
          <div className={styles.chunkRow} data-event-type="assistant_chunk">
            <Avatar name="TechHaven Agent" size={32} />
            <div className={styles.chunkBody}>
              <div className={styles.chunkMeta}>
                <span>TechHaven Agent</span>
                <span className={styles.chunkTime}>{formatTime(event.ts)}</span>
              </div>
              <div className={styles.chunkBubble}>{event.text}</div>
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
            <div className={styles.permEyebrow}>Runner 执行权限</div>
            <div className={styles.permTitle}>
              <FaShieldAlt aria-hidden="true" />
              <span>是否允许引擎发起工具调用</span>
              <span className={styles.toolName}>{event.tool}</span>
              <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            </div>
            {event.reason && <p className={styles.permReason}>{event.reason}</p>}
            <p className={styles.permHint}>这里只控制 runner 执行权限；产品数据写入仍需经过下方独立的产品提案审批。</p>
            {decision ? (
              <div className={`${styles.permDecision} ${decision === "approve" ? styles.permDecisionOk : styles.permDecisionNo}`}>
                {decision === "approve" ? <FaCheckCircle aria-hidden="true" /> : <FaTimesCircle aria-hidden="true" />}
                <span>
                  {decision === "approve"
                    ? isGatewayDriver
                      ? "已批准 · Gateway 会话继续"
                      : "已批准 · 本地会话继续"
                    : "已拒绝 Runner 权限 · 会话已取消"}
                </span>
              </div>
            ) : (
              <div className={styles.permActions}>
                <Button
                  className={styles.actionButton}
                  color="success"
                  size="small"
                  onClick={() => handleDecision(event.requestId, "approve")}
                >
                  允许 Runner 调用
                </Button>
                <Button
                  className={styles.actionButton}
                  color="error"
                  variant="light"
                  size="small"
                  onClick={() => handleDecision(event.requestId, "reject")}
                >
                  拒绝 Runner 调用
                </Button>
              </div>
            )}
          </div>
        );
      }
      case "proposal_lifecycle": {
        const proposal = event.proposal;
        const pending = proposal.status === "pending";
        const busy = proposalBusy[proposal.id] === true;
        const terminalTone =
          proposal.status === "applied"
            ? styles.proposalResultOk
            : proposal.status === "rejected" || proposal.status === "expired"
              ? styles.proposalResultNo
              : styles.proposalResultPending;
        return (
          <div className={styles.proposalCard} data-proposal-status={proposal.status}>
            <div className={styles.proposalEyebrow}>产品写提案 · 服务端权威</div>
            <div className={styles.proposalTitleRow}>
              <FaShieldAlt aria-hidden="true" />
              <strong>{proposal.subjectHashId}</strong>
              <span className={styles.proposalTransition}>
                {proposal.fromStatus} → {proposal.toStatus}
              </span>
              <span className={styles.toolTime}>{formatTime(event.ts)}</span>
            </div>
            <p className={styles.proposalReason}>{proposal.reason}</p>
            <div className={styles.proposalMeta}>
              <span>{proposal.tool}</span>
              <span>{proposal.subjectType}</span>
              <span title={proposal.expiresAt}>到期 {formatTime(proposal.expiresAt)}</span>
            </div>
            {proposal.note && <p className={styles.proposalNote}>{proposal.note}</p>}
            {pending ? (
              <div className={styles.permActions}>
                <Button
                  className={styles.actionButton}
                  color="success"
                  size="small"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void handleProposalDecision(proposal.id, "approve")}
                >
                  批准产品写入
                </Button>
                <Button
                  className={styles.actionButton}
                  color="error"
                  variant="light"
                  size="small"
                  disabled={busy}
                  onClick={() => void handleProposalDecision(proposal.id, "reject")}
                >
                  拒绝产品写入
                </Button>
              </div>
            ) : (
              <div className={`${styles.proposalResult} ${terminalTone}`} role="status">
                {proposal.status === "applied" ? <FaCheckCircle aria-hidden="true" /> : <FaInfoCircle aria-hidden="true" />}
                <span>{PROPOSAL_LABEL[proposal.status]}</span>
                {proposal.status === "approved" && <Loading size="small" text="" />}
              </div>
            )}
            <p className={styles.permHint}>批准只推进 proposal；实际写入仍由 MCP worker 重新读取域状态、校验状态机并幂等执行。</p>
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
      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Agent Control Plane · R1
        </div>
        <h1 className={styles.title}>每一次执行，都清晰可控。</h1>
        <p className={styles.desc}>分开观察 Runner 执行权限与产品写提案，在真实写入前完成服务端审批，并保留可回放的生命周期轨迹。</p>
        <div className={styles.heroControls}>
          <div className={styles.modePicker} role="group" aria-label="选择 Agent 运行模式">
            <span className={styles.modeLabel}>运行模式</span>
            <div className={styles.modeActions}>
              <Button
                className={styles.modeButton}
                color="primary"
                variant={isGatewayDriver ? "light" : "solid"}
                size="small"
                aria-pressed={!isGatewayDriver}
                onClick={() => handleDriverChange("mock")}
              >
                本地演示
              </Button>
              <Button
                className={styles.modeButton}
                color="primary"
                variant={isGatewayDriver ? "solid" : "light"}
                size="small"
                aria-pressed={isGatewayDriver}
                onClick={() => handleDriverChange("gateway")}
              >
                Gateway 联调
              </Button>
            </div>
          </div>
          <Button className={styles.configButton} color="secondary" variant="light" onClick={() => setConfigOpen(true)}>
            <FaCog aria-hidden="true" />
            API 配置
          </Button>
        </div>
      </header>

      <section className={styles.panel} aria-label="Agent 会话运行面板">
        <header className={styles.header}>
          <div className={styles.sessionIdentity}>
            <div className={styles.agentMark} aria-hidden="true">
              <FaBolt />
            </div>
            <div className={styles.sessionCopy}>
              <div className={styles.sessionTitleRow}>
                <h2 className={styles.sessionTitle}>工单协作会话</h2>
                <span className={`${styles.badge} ${styles[`badge--${STATUS_TONE[status]}`]}`} role="status">
                  <span className={`${styles.badgeDot} ${status === "running" ? styles.badgeDotPulse : ""}`} />
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <span className={styles.sid} title={sid}>
                {sid || "正在创建会话…"}
              </span>
            </div>
          </div>
          <Button className={styles.restartButton} color="secondary" variant="light" size="small" onClick={handleRestart}>
            <FaRedo aria-hidden="true" />
            重新运行
          </Button>
        </header>

        <div className={styles.contextBar} aria-label="会话概况">
          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>运行驱动</span>
            <strong>{isGatewayDriver ? "Gateway" : "Local Mock"}</strong>
          </div>
          <div className={styles.contextDivider} aria-hidden="true" />
          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>事件数量</span>
            <strong>{events.length}</strong>
          </div>
          <div className={styles.contextDivider} aria-hidden="true" />
          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>最后更新</span>
            <strong>{events.length > 0 ? formatTime(events[events.length - 1].ts) : "等待中"}</strong>
          </div>
        </div>

        <div className={styles.stream}>
          <SimpleBar scrollableNodeProps={{ ref: scrollBodyRef }} style={{ maxHeight: 440 }} autoHide={false}>
            <div className={styles.timeline} aria-live="polite" aria-label="会话事件流">
              {events.length === 0 && (
                <div className={styles.streamSkeleton}>
                  <Skeleton variant="text" lines={3} height={14} />
                </div>
              )}
              {visibleEvents.map((event) => (
                <React.Fragment key={`${event.seq}`}>{renderEvent(event)}</React.Fragment>
              ))}
              {status === "running" && (
                <div className={styles.streamLoadingRow}>
                  <Loading size="small" text="" />
                  <span>{isGatewayDriver ? "Gateway 正在返回事件…" : "本地引擎正在输出…"}</span>
                </div>
              )}
            </div>
          </SimpleBar>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerNote}>
            <FaInfoCircle aria-hidden="true" />
            <span>
              {isGatewayDriver
                ? "Gateway 验证模式：BFF/开发代理注入管理凭据与可信 actor；浏览器不持有 token。"
                : "演示模式：分别模拟 Runner 权限和产品 proposal，不会对真实工单写入。追加 ?driver=gateway 可切换本机 Gateway。"}
            </span>
          </div>
          <span className={styles.footerMono}>SSE · versioned envelope · staged approval</span>
        </footer>
      </section>

      <Modal visible={configOpen} title="Agent API 配置" onClose={() => setConfigOpen(false)} width={720} footer={null}>
        <div className={styles.configNotice} role="note">
          <FaShieldAlt aria-hidden="true" />
          <div>
            <strong>密钥由站点后端保存</strong>
            <p>
              这里复用个人 AI 接口配置，不写入浏览器存储。部署启用用户配置解析后，Gateway
              会按当前用户在服务端注入隔离的运行凭据；浏览器不会获得供应商密钥或 Gateway 管理令牌。
            </p>
          </div>
        </div>
        <AgentApiConfigCard />
      </Modal>
    </div>
  );
};

export default AgentSessionPanel;

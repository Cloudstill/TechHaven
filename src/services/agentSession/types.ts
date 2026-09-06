import type { EngineEvent } from "../../contracts/agent";
export type PermissionDecision = "approve" | "reject";

export type EngineEventListener = (event: EngineEvent) => void;

export interface SessionHandle {
  sid: string;
  start(): void;
  subscribe(listener: EngineEventListener): () => void;
  answerPermission(requestId: string, decision: PermissionDecision, note?: string): void;
  decideProposal(proposalId: string, decision: PermissionDecision, note?: string): Promise<void>;
  /** 用户显式放弃当前会话（如点击重新运行）时才调用。 */
  cancel(): void;
  /** 仅释放当前页面观察资源；不得把页面卸载误当成用户取消。 */
  dispose(): void;
}

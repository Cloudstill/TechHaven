import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "../contracts/agent";
import { AgentGatewayClient } from "./agentGatewayClient";

// 本测试文件使用 node 进程环境；根 tsconfig 面向浏览器（types: ["vite/client"]），
// 这里用文件内声明避免把 @types/node 的全局 setTimeout 等拖进整个编译
declare const process: { env: Record<string, string | undefined> };

/**
 * 真实 Gateway 集成验证（R1 门禁）：
 * 仅在设置 TECHHAVEN_GATEWAY_URL 时运行（CI 默认跳过）。
 * 本地：先 `npm run dev`（mock 驱动 + TECHHAVEN_GATEWAY_TOKEN=dev-token）启动网关，
 * 再执行 TECHHAVEN_GATEWAY_URL=http://127.0.0.1:3091 npm test。
 * 验证：创建会话 → SSE 读到待审批后断开 → 新 client 查询同一 SID 并全量回放
 * → 权限审批应答（approve）→ 会话 succeeded 且流以 end 关闭。
 */
const GATEWAY_URL = process.env.TECHHAVEN_GATEWAY_URL;

function authFetch(token: string): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
        "x-techhaven-actor": "user:9",
      },
    });
}

describe.skipIf(!GATEWAY_URL)("AgentGatewayClient × 本机 Gateway（integration）", () => {
  it("创建会话 → 观察端刷新式重连 → 历史回放 → 审批 → 终态关闭", async () => {
    const token = process.env.TECHHAVEN_GATEWAY_TOKEN ?? "dev-token";
    const client = new AgentGatewayClient(GATEWAY_URL, authFetch(token));

    const created = await client.createSession({
      orgId: 1,
      subjectType: "bug",
      subjectId: "bug_1",
      prompt: "集成验证：读取缺陷并分析。",
    });
    expect(created.sid).toBeTruthy();
    expect(["queued", "running"]).toContain(created.status);

    const initialEvents: EventEnvelope[] = [];
    let permissionRequestId = "";

    // 第一观察端读到审批点后主动断开，模拟页面刷新前的连接关闭。
    await new Promise<void>((resolve, reject) => {
      let unwatch: () => void = () => undefined;
      const timeout = setTimeout(() => {
        unwatch();
        reject(new Error(`等待 permission_request 超时（events=${initialEvents.length}）`));
      }, 30_000);
      unwatch = client.subscribeEvents(created.sid, {
        onEvent: (env) => {
          initialEvents.push(env);
          if (env.type !== "permission_request") return;
          permissionRequestId = env.payload.requestId;
          clearTimeout(timeout);
          unwatch();
          resolve();
        },
        onProtocolError: (message) => reject(new Error(message)),
        onEnd: () => reject(new Error("审批前事件流意外结束")),
      });
    });

    expect(initialEvents.some((env) => env.type === "tool_call")).toBe(true);
    expect(initialEvents.some((env) => env.type === "status_change" && env.payload.status === "awaiting_permission")).toBe(true);
    expect(permissionRequestId).toBeTruthy();

    // 新 client 不依赖旧连接内存：先查询同一 SID，再从 seq=0 全量回放以重建页面历史和审批卡。
    const resumedClient = new AgentGatewayClient(GATEWAY_URL, authFetch(token));
    const detail = await resumedClient.getSession(created.sid);
    expect(detail.status).toBe("awaiting_permission");

    const replayed: EventEnvelope[] = [];
    let sawSucceeded = false;
    let endReason: string | undefined;
    let answered = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unwatch();
        reject(new Error(`恢复后等待终态超时（events=${replayed.length}，end=${endReason}）`));
      }, 30_000);
      const unwatch = resumedClient.subscribeEvents(created.sid, {
        onEvent: (env) => {
          replayed.push(env);
          if (env.type === "assistant_chunk") expect(env.payload.text.length).toBeGreaterThan(0);
          if (env.type === "permission_request" && !answered) {
            answered = true;
            void resumedClient.answerPermission(created.sid, env.payload.requestId, "approve").catch((err) => {
              reject(err as Error);
            });
          }
          if (env.type === "status_change" && env.payload.status === "succeeded") sawSucceeded = true;
        },
        onProtocolError: (message) => reject(new Error(message)),
        onEnd: (reason) => {
          endReason = reason;
          clearTimeout(timeout);
          unwatch();
          resolve();
        },
      });
    });

    const replayedSeqs = replayed.map((env) => env.seq);
    expect(endReason).toBe("completed");
    expect(replayedSeqs.slice(0, initialEvents.length)).toEqual(initialEvents.map((env) => env.seq));
    expect(new Set(replayedSeqs).size).toBe(replayedSeqs.length);
    expect(answered).toBe(true);
    expect(sawSucceeded).toBe(true);
  }, 45_000);
});

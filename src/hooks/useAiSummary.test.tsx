import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import useAiSummary from "./useAiSummary";
import { tokenManager } from "../utils/http";

// react-dom 的 act() 需要显式标记测试环境（React 19 从 "react" 导出 act）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * AI-SSE token 泄露回归测试（R0 安全项）。
 *
 * 背景：请求开始的那段诊断日志曾打印 `token.substring(0, 8)` —— 长时凭据的前缀同样属于泄露，
 * 足以用于日志检索与口令猜测辅助。现在只打印布尔值。
 * 这里锁死：无论是否走 Vite proxy（决定是否真的带 Authorization 头），
 * 控制台里都不能出现 token 的任何片段（含前缀）。
 */

const TOKEN = "SECRET_AI_TOKEN_7f3c9a";

/** 构造一个立刻结束、可选带一个 chunk 的假 SSE 响应 */
function fakeSseResponse(chunks: string[] = []): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
        return;
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "text/event-stream" },
    body: stream,
  } as unknown as Response;
}

/** 把 hook 挂到一个宿主组件上，拿到 start 与当前 error */
function renderHook() {
  const captured: { start?: () => void } = {};
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Host() {
    const { start } = useAiSummary(123);
    captured.start = start;
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(<Host />);
  });
  return {
    start: () => captured.start!(),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 收集一段同步+异步执行期间 console 的全部输出 */
async function captureConsole(run: () => void): Promise<string[]> {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  const spyLog = vi.spyOn(console, "log").mockImplementation(record);
  const spyWarn = vi.spyOn(console, "warn").mockImplementation(record);
  const spyError = vi.spyOn(console, "error").mockImplementation(record);
  try {
    run();
    // 冲掉 fetch 的 promise 链与流式读取循环
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  } finally {
    spyLog.mockRestore();
    spyWarn.mockRestore();
    spyError.mockRestore();
  }
  return lines;
}

describe("AI 总结 SSE 日志脱敏", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalProxy = import.meta.env.VITE_USE_PROXY;

  beforeEach(() => {
    fetchMock = vi.fn(async () => fakeSseResponse(['data: {"type":"chunk","content":"你好"}\n\n']));
    vi.stubGlobal("fetch", fetchMock);
    tokenManager.setToken(TOKEN);
    // 走 proxy 分支：这条路径会真的把 token 放进 Authorization 头，覆盖面更大
    import.meta.env.VITE_USE_PROXY = "true";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    tokenManager.clearToken();
    import.meta.env.VITE_USE_PROXY = originalProxy;
  });

  it("日志绝不出现 token 原文，也不出现任意长度前缀", async () => {
    const view = renderHook();
    const lines = await captureConsole(() => view.start());

    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join("\n");

    // 完整 token
    expect(joined).not.toContain(TOKEN);
    // 当初泄露的形态就是 8 位前缀；这里从 6 位起逐个长度断言。
    // 不测 1~5 位：单/双字符前缀（"S"、"SE"）会与日志里的 "SSE"、"size" 等正常词撞上，
    // 产生假阳性而非真泄露。
    for (let n = 6; n <= TOKEN.length; n += 1) {
      expect(joined).not.toContain(TOKEN.slice(0, n));
    }
    // 仍应打印「是否携带 token」这一诊断位，防止「干脆不打印」也算通过
    expect(joined).toContain("携带 token");
    view.unmount();
  });

  it("请求头仍正确携带 Bearer token（脱敏不能牺牲功能）", async () => {
    const view = renderHook();
    await captureConsole(() => view.start());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    view.unmount();
  });

  it("未登录时日志明确显示未携带 token，且不写 undefined", async () => {
    tokenManager.clearToken();
    const view = renderHook();
    const lines = await captureConsole(() => view.start());

    const joined = lines.join("\n");
    expect(joined).toContain("携带 token : false");
    expect(joined).not.toContain("undefined");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    view.unmount();
  });
});

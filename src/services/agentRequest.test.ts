import { afterEach, describe, expect, it, vi } from "vitest";
import { agentRequest } from "./agentRequest";

afterEach(() => vi.restoreAllMocks());
describe("Agent service outage boundary", () => {
  it("reports a stopped service without changing login or invoking another API", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(agentRequest(fetcher, "/gateway/v1/sessions")).rejects.toThrow("其他页面仍可正常使用");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("bounds a hanging request with an abort signal", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Timeout", "TimeoutError")), { once: true });
        }),
    );
    const request = agentRequest(fetcher, "/gateway/v1/sessions");
    const outcome = expect(request).rejects.toThrow("连接超时");
    controller.abort();
    await outcome;
    expect(timeout).toHaveBeenCalledWith(8000);
  });
  it("keeps authentication rejection available to callers and normalizes a 503", async () => {
    expect((await agentRequest(vi.fn().mockResolvedValue(new Response(null, { status: 401 })), "/gateway")).status).toBe(401);
    await expect(agentRequest(vi.fn().mockResolvedValue(new Response(null, { status: 503 })), "/gateway")).rejects.toThrow(
      "暂时不可用",
    );
  });
});

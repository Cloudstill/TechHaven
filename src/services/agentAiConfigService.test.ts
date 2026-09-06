import { describe, it, expect, vi, afterEach } from "vitest";
import { AgentAiConfigService } from "./agentAiConfigService";
import { AuthService } from "./authService";

const input = { type: "openai" as const, url: "https://example.com/v1/responses", api_key: "test-key" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.restoreAllMocks());

describe("Agent configuration store selection", () => {
  it("updates a changed key and endpoint in one request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ storage: "assets" }))
      .mockResolvedValueOnce(json({ configs: [{ id: 12, is_default: true }], preference: null }))
      .mockImplementation(async () => json({ ok: true }));
    await new AgentAiConfigService(fetcher).saveAiConfig(input);
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/key"))).toBe(false);
    expect(fetcher.mock.calls[2][1].method).toBe("PATCH");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ url: input.url, api_key: input.api_key });
  });
  it("new assets are saved to the store the runner reads and selected for subsequent runs", async () => {
    const oldSave = vi.spyOn(AuthService, "saveAiConfig");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ storage: "assets" }))
      .mockResolvedValueOnce(json({ configs: [], preference: null }))
      .mockResolvedValueOnce(json({ id: 12 }))
      .mockResolvedValueOnce(json({ ok: true }));
    await new AgentAiConfigService(fetcher).saveAiConfig(input);
    expect(fetcher.mock.calls[2][0]).toBe("/gateway/v1/ai-configs");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ api_key: "test-key", is_default: true });
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ config_id: 12, org_id: null });
    expect(oldSave).not.toHaveBeenCalled();
  });

  it("preserves masked existing keys and clears removed optional fields", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ storage: "assets" }))
      .mockResolvedValueOnce(json({ configs: [{ id: 12, is_default: true, api_key: "sk-***" }], preference: null }))
      .mockImplementation(async () => json({ ok: true }));
    await new AgentAiConfigService(fetcher).saveAiConfig({ ...input, api_key: "" });
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/key"))).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ model: null, reasoning_effort: null, max_tokens: null });
  });

  it("only explicit legacy mode permits legacy writes; authentication/outages never fall back", async () => {
    const oldSave = vi.spyOn(AuthService, "saveAiConfig").mockResolvedValue();
    await new AgentAiConfigService(vi.fn().mockResolvedValue(json({ storage: "legacy" }))).saveAiConfig(input);
    expect(oldSave).toHaveBeenCalledOnce();
    oldSave.mockClear();
    for (const status of [401, 403, 404, 503]) {
      await expect(
        new AgentAiConfigService(vi.fn().mockResolvedValue(json({ error: "unavailable" }, status))).saveAiConfig(input),
      ).rejects.toThrow();
    }
    expect(oldSave).not.toHaveBeenCalled();
  });
});

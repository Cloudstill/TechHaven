import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import AgentApiConfigCard from "./AgentApiConfigCard";
import LegacyApiConfigCard from "../personal/components/ApiConfigCard";

const api = vi.hoisted(() => ({ get: vi.fn(), legacyGet: vi.fn(), save: vi.fn() }));
vi.mock("@/services/agentAiConfigService", () => ({ agentAiConfigService: { getAiConfig: api.get, saveAiConfig: api.save } }));
vi.mock("@/services/authService", () => ({ AuthService: { getAiConfig: api.legacyGet, saveAiConfig: api.save } }));
let root: Root | undefined;
let container: HTMLDivElement;
async function render(element: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("shows a retryable error instead of an editable empty form when Agent is unavailable", async () => {
  api.get.mockRejectedValueOnce(new Error("服务离线"));
  await render(<AgentApiConfigCard />);
  expect(container.textContent).toContain("Agent 配置暂时不可用");
  expect(container.querySelector("input")).toBeNull();
  expect(api.legacyGet).not.toHaveBeenCalled();
  api.get.mockResolvedValueOnce(null);
  await act(async () => container.querySelector("button")!.click());
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(container.querySelector("input")).not.toBeNull();
  expect(container.textContent).not.toContain("Agent 配置暂时不可用");
});
it("loads the ordinary personal settings without any Agent request", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Agent is offline"));
  vi.stubGlobal("fetch", fetcher);
  api.legacyGet.mockResolvedValueOnce(null);
  await render(<LegacyApiConfigCard />);
  expect(api.legacyGet).toHaveBeenCalledOnce();
  expect(api.get).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(container.querySelector("input")).not.toBeNull();
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Outlet } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../pages/home/IndexPage", () => ({ default: () => <div>home</div> }));
vi.mock("../pages/auth/AuthPage", () => ({ default: () => <div>login</div> }));
vi.mock("../pages/error/NotFound404", () => ({ default: () => <div>not-found</div> }));
vi.mock("../components/pageSkeleton/PageSkeleton", () => ({ default: () => <div>loading</div> }));
vi.mock("../components/maintenance/MaintenanceGuard", () => ({ default: () => <Outlet /> }));
vi.mock("../components/auth/AuthRequired", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../pages/rd-platform/RdLayout", () => ({ default: () => <Outlet /> }));
vi.mock("../pages/rd-platform/AgentSessionPanel", () => ({ default: () => <div>agent-panel-loaded</div> }));

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
for (const [flag, expected] of [
  [undefined, "not-found"],
  ["false", "not-found"],
  ["TRUE", "not-found"],
  ["true", "agent-panel-loaded"],
] as const) {
  it(`direct /rd/agent navigation with flag=${String(flag)} resolves to ${expected}`, async () => {
    vi.resetModules();
    vi.stubEnv("VITE_AGENT_ENABLED", flag);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { default: RouterConfig } = await import("./RouterConfig");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/rd/agent"]}>
          <RouterConfig />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain(expected);
    expect(fetcher).not.toHaveBeenCalled();
  });
}

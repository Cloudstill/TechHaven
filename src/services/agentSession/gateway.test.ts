import { afterEach, expect, it, vi } from "vitest";
import { createGatewaySession } from "./gateway";

const client = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ sid: "session-1" })),
  getSession: vi.fn(async () => ({ status: "running" })),
  subscribeEvents: vi.fn(),
  listProposals: vi.fn(async () => ({ proposals: [] })),
  cancel: vi.fn(async () => {}),
}));
vi.mock("../agentGatewayClient", () => ({
  AgentGatewayClient: class {
    constructor() {
      return client;
    }
  },
}));
afterEach(() => {
  sessionStorage.clear();
});

it("unmount releases observation while explicit cancel cancels the server session", async () => {
  const releaseStream = vi.fn();
  client.subscribeEvents.mockReturnValue(releaseStream);
  const handle = createGatewaySession(() => {});
  handle.start();
  await vi.waitFor(() => expect(handle.sid).toBe("session-1"));
  handle.dispose();
  expect(releaseStream).toHaveBeenCalledOnce();
  expect(client.cancel).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("techhaven:dev-agent-session")).toBe("session-1");
  handle.cancel();
  expect(client.cancel).toHaveBeenCalledWith("session-1");
  expect(sessionStorage.getItem("techhaven:dev-agent-session")).toBeNull();
});

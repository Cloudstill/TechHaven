import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { WebSocketClient } from "./websocket";

/**
 * token 脱敏回归测试（R0 安全项）。
 *
 * 背景：此前 `connect()` 会把含完整 token 的建连 URL 直接打进 console
 * （旁边那个 `token: "***"` 只是装饰，真正泄露的是 URL 本身）。
 * 这里锁死两件事：
 *   1. 传输方式不变——URL 里**仍要**带 token，因为后端鉴权依赖该 query 参数；
 *   2. 日志/控制台里**绝不能**出现 token 与 token_time 的原文。
 * 两者必须同时成立，任何只满足其一的改法（比如为了脱敏把 token 从 URL 里摘掉）
 * 都会让这里变红。
 */

/** 一个只记录入参、不真正建连的 WebSocket 替身 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }
}

const TOKEN = "S_TOKEN_VALUE_SUPER_SECRET_9f3a";
const TOKEN_TIME = "1756000000000";

/** 收集一次 connect 期间 console 的全部输出文本 */
function captureConsole(client: WebSocketClient, uid: string | number | undefined): string[] {
  const lines: string[] = [];
  const spyLog = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
  const spyError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  });
  try {
    client.connect(uid);
  } finally {
    spyLog.mockRestore();
    spyError.mockRestore();
  }
  return lines;
}

describe("WebSocket 建连 token 处理", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket;
    // jsdom 下直接写 document.cookie 即可，过期时间设到未来避免被丢弃
    document.cookie = `S_TOKEN=${TOKEN}; path=/`;
    document.cookie = `S_TOKEN_TIME=${TOKEN_TIME}; path=/`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("建连 URL 仍携带 token（后端鉴权依赖该 query 参数，传输方式未变）", () => {
    const client = new WebSocketClient("/ws/v1/notification");
    captureConsole(client, 42);

    expect(MockWebSocket.instances).toHaveLength(1);
    const url = MockWebSocket.instances[0].url;
    expect(url).toContain(`token=${TOKEN}`);
    expect(url).toContain(`token_time=${TOKEN_TIME}`);
    expect(url).toContain("uid=42");
  });

  it("控制台输出绝不出现 token / token_time 原文", () => {
    const client = new WebSocketClient("/ws/v1/notification");
    const lines = captureConsole(client, 42);

    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join("\n");
    expect(joined).not.toContain(TOKEN);
    expect(joined).not.toContain(TOKEN_TIME);
    // 脱敏占位必须真的出现，防止「干脆不打印」也算通过
    expect(joined).toContain("***");
  });

  it("脱敏不误伤 uid：uid 仍完整出现在日志里", () => {
    const client = new WebSocketClient("/ws/v1/notification");
    const lines = captureConsole(client, 42);
    expect(lines.join("\n")).toContain("42");
  });

  it("无 Cookie 时 URL 不带 token 参数，且不会写出 undefined", () => {
    // 清掉两个 Cookie（置为过期）
    document.cookie = "S_TOKEN=; path=/; max-age=0";
    document.cookie = "S_TOKEN_TIME=; path=/; max-age=0";

    const client = new WebSocketClient("/ws/v1/notification");
    const lines = captureConsole(client, 7);

    const url = MockWebSocket.instances[0].url;
    expect(url).not.toContain("token=");
    expect(url).not.toContain("token_time=");
    expect(url).toContain("uid=7");
    expect(lines.join("\n")).not.toContain("***");
  });

  it("Cookie 值含 = 时不截断（base64 填充 / JWT 分段场景）", () => {
    // 含两个 "=" 的 token：split("=") 会把值切在第一处，只剩 "PADDED_"
    const padded = "PADDED_BASE64_TOKEN_==";
    document.cookie = `S_TOKEN=${padded}; path=/`;

    const client = new WebSocketClient("/ws/v1/notification");
    captureConsole(client, 9);

    const url = MockWebSocket.instances[0].url;
    // 必须带上完整值（URLSearchParams 会转义，故用解码后的参数断言）
    const token = new URL(url).searchParams.get("token");
    expect(token).toBe(padded);
  });

  it("重连不会绕过脱敏：每次 connect 都重新脱敏", () => {
    const client = new WebSocketClient("/ws/v1/notification");
    captureConsole(client, 1);
    // 手动置为 CLOSED，绕开「已连接/连接中就不重复建连」的短路
    MockWebSocket.instances[0].readyState = MockWebSocket.CLOSED;
    const second = captureConsole(client, 1);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(second.join("\n")).not.toContain(TOKEN);
    expect(second.join("\n")).toContain("***");
  });
});

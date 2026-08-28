/**
 * P1 端到端冒烟：spawn dist/index.js（mock 驱动），走 HTTP + SSE 全闭环，
 * 验证鉴权 / 会话创建 / 事件桥 / 权限中继 / 终态 / 配额 / 审计 JSONL（TH-RFC-001 §05.1）。
 *
 *   npm run smoke    （先 build，再以客户端身份驱动真实网关进程）
 *
 * 脚手架 ≈ services/techhaven-mcp/src/smoke.ts 同构孪生（防漂移：改动需同步评审两处）
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineEvent } from "./types.js";

const PORT = 3097;
const TOKEN = "smoke-token";
const BASE = `http://127.0.0.1:${PORT}`;
const SMOKE_DATA_DIR = "data-smoke";
/** 包根目录（dist / data-smoke 都挂在这里，与子进程 cwd 保持一致） */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}` };
}

/** 普通 JSON API 调用（勿用于 SSE；401 用例走裸 fetch） */
async function api(method: string, path: string, opts: { body?: unknown } = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // 空响应体 / 非 JSON（如 401 文本），置 null 即可
  }
  return { status: res.status, json };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时：${label}（${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** 等网关进程监听就绪 */
async function waitReady(timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/healthz`, { headers: authHeaders() });
      if (res.ok) return true;
    } catch {
      // 尚未监听，继续等
    }
    await sleep(100);
  }
  return false;
}

interface SseItem {
  event?: EngineEvent;
  end?: boolean;
}

/**
 * SSE 读取器：手写解析（id: / event: / data: / 注释行 / 空行分帧）。
 * 用手动 iterator 而非 for-await：中途暂停后还要继续读，for-await 的 break 会关闭流。
 */
class SseReader {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private lineBuf = "";
  private eventName: string | null = null;
  private dataLines: string[] = [];

  constructor(res: Response) {
    const body = res.body as unknown as AsyncIterable<Uint8Array> | null;
    if (!body) throw new Error("SSE 响应无 body（连接可能被提前关闭）");
    this.iterator = body[Symbol.asyncIterator]();
  }

  async close(): Promise<void> {
    // 流被 async iterator 锁定，必须走迭代器 return 协议释放；直接 body.cancel() 会 ERR_INVALID_STATE
    try {
      await this.iterator.return?.();
    } catch {
      // 连接可能已关闭
    }
  }

  async next(): Promise<SseItem> {
    while (true) {
      const idx = this.lineBuf.indexOf("\n");
      if (idx >= 0) {
        const line = this.lineBuf.slice(0, idx).replace(/\r$/, "");
        this.lineBuf = this.lineBuf.slice(idx + 1);
        if (line.startsWith(":")) continue; // keepalive 注释行
        if (line.startsWith("event:")) {
          this.eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          this.dataLines.push(line.slice(5).trim());
          continue;
        }
        if (line === "") {
          // 空行 = 一帧结束
          const name = this.eventName;
          const payload = this.dataLines.join("\n");
          this.eventName = null;
          this.dataLines = [];
          if (name === "end") return { end: true };
          if (payload) return { event: JSON.parse(payload) as EngineEvent };
        }
        continue; // 其余行（如 id:）忽略
      }
      const chunk = await this.iterator.next();
      if (chunk.done) return { end: true };
      this.lineBuf += Buffer.from(chunk.value).toString("utf8");
    }
  }
}

type PermissionRequestEvent = Extract<EngineEvent, { type: "permission_request" }>;

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (name: string, cond: boolean, detail?: string): void => {
    console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : ` —— ${detail ?? ""}`}`);
    if (!cond) failures.push(name);
  };

  const child = spawn(process.execPath, [join(ROOT, "dist", "index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TECHHAVEN_GATEWAY_TOKEN: TOKEN,
      TECHHAVEN_GATEWAY_PORT: String(PORT),
      TECHHAVEN_ENGINE_DRIVER: "mock",
      TECHHAVEN_GATEWAY_DATA_DIR: `./${SMOKE_DATA_DIR}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
  });

  let sseRes: Response | undefined;
  let sse: SseReader | undefined;

  try {
    // 0. 服务就绪
    if (!(await waitReady())) {
      throw new Error(`网关未在预期时间内就绪\n---- gateway stderr ----\n${stderr.slice(-2000)}`);
    }
    check("网关进程就绪", true);

    // 1. 健康检查免鉴权（探活不携带凭据）；业务接口无 token → 401
    const noToken = await fetch(`${BASE}/healthz`);
    check("无 token 访问 /healthz → 200（健康检查免鉴权）", noToken.status === 200, `收到 ${noToken.status}`);
    const health = await api("GET", "/healthz");
    check(
      "带 token 访问 /healthz → 200 且 driver=mock",
      health.status === 200 && health.json?.ok === true && health.json?.driver === "mock",
      JSON.stringify(health.json),
    );

    // 2. 创建会话
    const created = await api("POST", "/v1/sessions", {
      body: { orgId: 1, subjectType: "bug", subjectId: "bug_1", prompt: "读取缺陷并修复" },
    });
    check("POST /v1/sessions → 201 且返回 sid", created.status === 201 && typeof created.json?.sid === "string", JSON.stringify(created.json));
    const sid = created.json.sid as string;

    // 3. SSE：读到 permission_request（顺带断言见到 assistant_chunk / tool_call get_ticket）
    sseRes = await fetch(`${BASE}/v1/sessions/${sid}/events`, { headers: authHeaders() });
    check(
      "SSE 响应 content-type 为 text/event-stream",
      (sseRes.headers.get("content-type") ?? "").includes("text/event-stream"),
      sseRes.headers.get("content-type") ?? "无",
    );
    const reader = new SseReader(sseRes);
    sse = reader;
    const seen: EngineEvent[] = [];
    let perm: PermissionRequestEvent | undefined;
    while (!perm) {
      const item = await withTimeout(reader.next(), 15_000, "等待 permission_request");
      if (item.end) break;
      if (!item.event) continue;
      seen.push(item.event);
      if (item.event.type === "permission_request") perm = item.event;
    }
    check("SSE 见到 assistant_chunk", seen.some((e) => e.type === "assistant_chunk"), JSON.stringify(seen.map((e) => e.type)));
    check(
      "SSE 见到 tool_call mcp__techhaven__get_ticket",
      seen.some((e) => e.type === "tool_call" && e.tool === "mcp__techhaven__get_ticket"),
      JSON.stringify(seen.map((e) => e.type)),
    );
    check("SSE 收到 permission_request", perm !== undefined, JSON.stringify(seen.map((e) => e.type)));

    // 4. 审批通过 → 读到 succeeded → 流以 event: end 收尾
    const approved = await api("POST", `/v1/sessions/${sid}/permission`, {
      body: { requestId: perm?.requestId ?? "", decision: "approve" },
    });
    check("POST permission approve → 200 ok", approved.status === 200 && approved.json?.ok === true, JSON.stringify(approved.json));
    let succeeded = false;
    let streamEnded = false;
    while (!succeeded && !streamEnded) {
      const item = await withTimeout(reader.next(), 15_000, "等待 succeeded");
      if (item.end) {
        streamEnded = true;
        break;
      }
      if (item.event?.type === "status_change" && item.event.status === "succeeded") succeeded = true;
    }
    check("approve 后收到 status_change succeeded", succeeded);
    const tail = streamEnded ? { end: true } : await withTimeout(reader.next(), 15_000, "等待 event: end");
    check("终态后 SSE 以 event: end 关闭", tail.end === true, JSON.stringify(tail));

    // 5. 会话详情：终态已落
    const detail = await api("GET", `/v1/sessions/${sid}`);
    check(
      "GET /v1/sessions/:sid → status=succeeded",
      detail.status === 200 && detail.json?.status === "succeeded",
      JSON.stringify(detail.json),
    );

    // 6. 配额：org2 连开 3 个（默认 maxSessionsPerOrg=3）→ 第 4 个 → 429
    const placeholders: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await api("POST", "/v1/sessions", { body: { orgId: 2, prompt: `配额占位会话 #${i + 1}` } });
      if (r.status === 201 && typeof r.json?.sid === "string") placeholders.push(r.json.sid);
    }
    check("org2 连开 3 个会话成功", placeholders.length === 3, `实际 ${placeholders.length}`);
    const over = await api("POST", "/v1/sessions", { body: { orgId: 2, prompt: "应被配额拒绝" } });
    check("第 4 个会话 → 429 配额超限", over.status === 429 && typeof over.json?.error === "string", `收到 ${over.status} ${JSON.stringify(over.json)}`);
    for (const pid of placeholders) {
      const c = await api("POST", `/v1/sessions/${pid}/cancel`);
      check(`取消占位会话 ${pid} → 200`, c.status === 200 && c.json?.ok === true, `收到 ${c.status}`);
    }

    // 7. 401 / 404
    const noAuth = await fetch(`${BASE}/v1/sessions`);
    check("无 token 访问业务接口 → 401", noAuth.status === 401, `收到 ${noAuth.status}`);
    const missing = await api("GET", "/v1/sessions/s_does_not_exist");
    check("未知 sid → 404", missing.status === 404, `收到 ${missing.status}`);

    // 8. 审计 JSONL：存在，含 event 行与 permission 审计行
    const jsonlPath = join(ROOT, SMOKE_DATA_DIR, "gateway.jsonl");
    const jsonl = existsSync(jsonlPath) ? readFileSync(jsonlPath, "utf8") : "";
    const lines = jsonl.split("\n").filter((l) => l.trim().length > 0);
    check("gateway.jsonl 存在且非空", lines.length > 0, jsonlPath);
    check("JSONL 含本会话 event 行", lines.some((l) => l.includes('"kind":"event"') && l.includes(sid)));
    check(
      "JSONL 含 permission 审计行",
      lines.some((l) => l.includes('"kind":"permission"') && (perm ? l.includes(perm.requestId) : false)),
    );
  } catch (err) {
    failures.push(String(err));
    console.error("✗ 异常:", err);
    if (stderr) console.error("---- gateway stderr 末尾 ----\n" + stderr.slice(-2000));
  }

  // 收尾：断开 SSE（走迭代器 return 协议释放流锁）、终止网关进程
  await sse?.close();
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  console.log(failures.length === 0 ? "\nGATEWAY SMOKE PASS" : `\nGATEWAY SMOKE FAIL（${failures.length} 项）`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main();

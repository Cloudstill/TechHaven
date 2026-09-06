import { getErrorMsg } from "./errorCodes";

type MessageHandler = (data: any) => void;
type EventHandler = (event?: Event) => void;

/** WebSocket 服务端错误帧（与 HTTP API 同构的 errno / errstr 格式） */
export interface WsServerError {
  errno: number;
  errstr: string;
  message: string;
}

type ServerErrorHandler = (err: WsServerError) => void;

/**
 * 从 Cookie 中读取指定 key 的值。
 *
 * 用 indexOf 而非 split("=") 取值：Cookie 值本身允许含 "="（base64 填充、JWT 分段等），
 * split 会在第一个 "=" 处切断导致 token 被静默截断 —— 表现为「Cookie 明明有值却鉴权失败」。
 */
function getCookie(key: string): string | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) !== key) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

/**
 * WebSocket 客户端封装
 * 支持自动重连、消息分发、Cookie 鉴权
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private basePath: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private openHandlers: Set<EventHandler> = new Set();
  private closeHandlers: Set<EventHandler> = new Set();
  private errorHandlers: Set<EventHandler> = new Set();
  private serverErrorHandlers: Set<ServerErrorHandler> = new Set();
  private intentionalClose = false;
  /** 连接时收到鉴权错误帧（如 token 过期），交由上层刷新 token，不再自动重连 */
  private authFailed = false;
  private pendingSend: string[] = [];
  private uid: string | number | undefined;

  /**
   * @param path WebSocket 路径，如 "/notification"
   */
  constructor(path: string) {
    const explicit = import.meta.env.VITE_WS_URL;
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    // 显式配置了非回环地址（如线上 wss://域名）则用显式配置；
    // 否则（未配置或 127.0.0.1/localhost）用当前页面 origin 推导，
    // 避免手机/局域网通过非本机主机访问时连到 127.0.0.1 导致失败
    const isLoopback = !explicit || /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/i.test(explicit);
    const baseUrl = isLoopback ? `${wsProto}://${window.location.host}` : explicit;
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    this.basePath = `${cleanBase}${cleanPath}`;
  }

  /** 获取连接状态 */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 建立连接（uid 从 AuthContext 传入，token / token_time 从 Cookie 读取） */
  connect(uid?: string | number) {
    if (uid !== undefined) {
      this.uid = uid;
    }
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    this.intentionalClose = false;
    this.authFailed = false;

    // 页面卸载时标记为主动关闭，避免触发无意义的自动重连调度
    const handleBeforeUnload = () => {
      this.intentionalClose = true;
    };
    window.addEventListener("beforeunload", handleBeforeUnload, { once: true });

    const token = getCookie("S_TOKEN");
    const tokenTime = getCookie("S_TOKEN_TIME");

    const params = new URLSearchParams();
    if (this.uid !== undefined && this.uid !== null && this.uid !== "") params.set("uid", String(this.uid));
    if (token) params.set("token", token);
    if (tokenTime) params.set("token_time", tokenTime);

    // token 属于长时凭据：仅用于建连，绝不进入日志/控制台
    // 注意：当前仍通过 query 传递，是因为后端鉴权依赖该参数；
    // 迁移到同源 Cookie 或一次性 ticket 需要后端配合，见 docs/ROADMAP.md R0
    const connectUrl = `${this.basePath}?${params.toString()}`;

    const logParams = new URLSearchParams(params);
    if (logParams.has("token")) logParams.set("token", "***");
    if (logParams.has("token_time")) logParams.set("token_time", "***");
    console.log("[WS] 正在连接:", `${this.basePath}?${logParams.toString()}`, { uid: this.uid });

    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      console.log("[WS] 连接已建立");
      this.authFailed = false;
      while (this.pendingSend.length > 0) {
        const msg = this.pendingSend.shift();
        this.ws?.send(msg!);
      }
      this.openHandlers.forEach((fn) => fn());
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // 服务端错误帧：携带 errno 且不为 0，按 HTTP API 同样的 errno/errstr 格式解析
        if (data && typeof data === "object" && typeof data.errno === "number" && data.errno !== 0) {
          const errstr = typeof data.errstr === "string" ? data.errstr : typeof data.msg === "string" ? data.msg : "";
          const parsed: WsServerError = {
            errno: data.errno,
            errstr,
            message: getErrorMsg(data.errno, errstr),
          };
          // 鉴权类错误（token 过期 / 不匹配 / 账号异常）交由上层刷新 token，不在底层自动重连
          if (data.errno === 1101 || data.errno === 1103) {
            this.authFailed = true;
          }
          this.serverErrorHandlers.forEach((fn) => fn(parsed));
        }
        const type = data.type || data.event || "message";
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          handlers.forEach((fn) => fn(data));
        }
        const allHandlers = this.messageHandlers.get("*");
        if (allHandlers) {
          allHandlers.forEach((fn) => fn(data));
        }
      } catch {
        const allHandlers = this.messageHandlers.get("*");
        if (allHandlers) {
          allHandlers.forEach((fn) => fn(event.data));
        }
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log("[WS] 连接关闭, code:", event.code, "reason:", event.reason || "(无)");
      this.closeHandlers.forEach((fn) => fn(event));
      // 鉴权失败时交由上层处理（刷新 token / 登出），不再触发自动重连
      if (!this.intentionalClose && !this.authFailed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event: Event) => {
      console.error("[WS] 连接错误:", event);
      this.errorHandlers.forEach((fn) => fn(event));
    };
  }

  /** 断开连接（不重连） */
  disconnect() {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.pendingSend = [];
    this.reconnectAttempts = 0;
  }

  /** 发送消息 */
  send(data: string | object) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.pendingSend.push(payload);
    }
  }

  // ---------- 事件订阅（返回取消订阅函数） ----------

  /** 订阅指定类型的消息 */
  onMessage(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  /** 连接成功回调 */
  onOpen(handler: EventHandler): () => void {
    this.openHandlers.add(handler);
    return () => {
      this.openHandlers.delete(handler);
    };
  }

  /** 连接关闭回调 */
  onClose(handler: EventHandler): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  /** 连接错误回调 */
  onError(handler: EventHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /** 服务端错误帧回调（errno/errstr 同 HTTP API） */
  onServerError(handler: ServerErrorHandler): () => void {
    this.serverErrorHandlers.add(handler);
    return () => {
      this.serverErrorHandlers.delete(handler);
    };
  }

  /** 调度自动重连（指数退避，最大 30s） */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** 通知 WebSocket 单例（path: /ws/v1/notification） */
export const notificationWS = new WebSocketClient("/ws/v1/notification");

/** 聊天 WebSocket 单例（path: /ws/v1/messages，双向收发消息） */
export const chatWS = new WebSocketClient("/ws/v1/messages");

export default WebSocketClient;

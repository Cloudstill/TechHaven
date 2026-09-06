import { useState, useRef, useCallback, useEffect } from "react";
import { tokenManager } from "../utils/http";

/**
 * 时间戳工具函数，格式: [HH:MM:SS.mmm]
 */
const ts = () => {
  const d = new Date();
  return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}]`;
};

/**
 * AI 总结 Hook（SSE 流式版）
 *
 * POST /api/v1/article/ai-summary，后端使用 DoRequestStreaming + SSEServlet
 * 流式返回 AI 生成的总结文本。前端通过 fetch + ReadableStream 逐块读取，
 * 按 SSE 协议解析后实时推送到 UI。
 */
function useAiSummary(articleId?: string | number) {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      console.log(`${ts()} [AI-SSE] 🛑 abort() 调用，中断流式请求`);
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (articleId == null) return;

    // 清理上一次请求
    cleanup();
    setText("");
    setError(null);
    setIsStreaming(true);
    setIsCompleted(false);

    // ---- 构造请求 ----
    const controller = new AbortController();
    abortRef.current = controller;

    const useProxy = import.meta.env.VITE_USE_PROXY === "true";
    const token = tokenManager.getToken();

    // SSE stream via Vite proxy in dev (no CORS), direct via nginx in prod.
    // A dedicated proxy rule in vite.config.ts handles /api/v1/article/ai-summary
    // to avoid any buffering of chunked transfer-encoding.
    const url = useProxy ? "/api/v1/article/ai-summary" : `${import.meta.env.VITE_API_BASE_URL as string}/article/ai-summary`;

    const formData = new URLSearchParams();
    formData.append("article_id", String(articleId));

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/event-stream",
    };
    // 走 Vite proxy 时带上 token header（同源无 CORS 问题）；
    // 直连后端时不带 Authorization，避免触发 CORS preflight
    if (token && useProxy) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // ---- 日志：请求开始 ----
    console.log(`${ts()} [AI-SSE] ╔══════════════════════════════════════╗`);
    console.log(`${ts()} [AI-SSE] ║     🚀 发起 SSE 流式请求              ║`);
    console.log(`${ts()} [AI-SSE] ╠══════════════════════════════════════╣`);
    console.log(`${ts()} [AI-SSE] ║ URL        : ${url}`);
    console.log(`${ts()} [AI-SSE] ║ articleId  : ${articleId}`);
    console.log(`${ts()} [AI-SSE] ║ proxy 模式 : ${useProxy}`);
    console.log(`${ts()} [AI-SSE] ║ 路由方式   : ${useProxy ? "Vite proxy → 后端" : "直连后端"}`);
    console.log(`${ts()} [AI-SSE] ║ 携带 token : ${!!token}`);
    console.log(`${ts()} [AI-SSE] ║ ⚠️ 如果下面长时间没有响应日志，检查终端里 Vite 的 proxy 日志`);
    console.log(`${ts()} [AI-SSE] ╚══════════════════════════════════════╝`);

    // 超时看门狗：每隔 5 秒检查 fetch 是否已得到响应头
    let resolved = false;
    const watchdogTimer = setInterval(() => {
      if (!resolved) {
        console.warn(`${ts()} [AI-SSE] ⏰ 等待响应中... (已过去 ${Math.round((Date.now() - startTs) / 1000)}s)`);
      }
    }, 5000);
    const startTs = Date.now();

    fetch(url, {
      method: "POST",
      headers,
      body: formData.toString(),
      signal: controller.signal,
    })
      .then(async (response) => {
        resolved = true;
        clearInterval(watchdogTimer);

        // ---- 日志：响应头 ----
        console.log(`${ts()} [AI-SSE] ┌────────── 收到响应 ──────────`);
        console.log(`${ts()} [AI-SSE] │ status       : ${response.status} ${response.statusText}`);
        console.log(`${ts()} [AI-SSE] │ content-type : ${response.headers.get("content-type")}`);
        console.log(`${ts()} [AI-SSE] │ transfer-enc : ${response.headers.get("transfer-encoding")}`);
        console.log(`${ts()} [AI-SSE] │ 首包延迟     : ${Math.round((Date.now() - startTs) / 1000)}s`);
        console.log(`${ts()} [AI-SSE] └──────────────────────────────`);

        if (!response.ok) {
          let errorBody = "";
          try {
            errorBody = await response.text();
          } catch {
            // ignore
          }
          console.error(`${ts()} [AI-SSE] ❌ HTTP 错误响应 body:`, errorBody.substring(0, 500));
          throw new Error(`请求失败 (HTTP ${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          console.error(`${ts()} [AI-SSE] ❌ response.body 为空，无法获取 ReadableStream reader`);
          throw new Error("浏览器不支持流式读取（ReadableStream）");
        }

        console.log(`${ts()} [AI-SSE] ┌────────── 开始读取流 ──────────`);
        console.log(`${ts()} [AI-SSE] │ ✅ reader 已就绪，进入逐块读取循环`);

        const decoder = new TextDecoder("utf-8");
        let buffer = ""; // 行缓冲区：攒够一个完整行再解析
        let chunkSeq = 0;
        let totalBytes = 0;
        let eventCount = 0;

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`${ts()} [AI-SSE] │ 🏁 流结束 (done=true)`);
            console.log(`${ts()} [AI-SSE] │ 总 chunk 数   : ${chunkSeq}`);
            console.log(`${ts()} [AI-SSE] │ 总字节数      : ${totalBytes}`);
            console.log(`${ts()} [AI-SSE] │ SSE 事件数    : ${eventCount}`);
            console.log(`${ts()} [AI-SSE] │ buffer 残留    : "${buffer.substring(0, 100)}"`);
            console.log(`${ts()} [AI-SSE] └──────────────────────────────`);

            // 处理 buffer 中可能残留的最后一个事件
            if (buffer.trim()) {
              console.log(`${ts()} [AI-SSE] 🔧 处理残留 buffer: "${buffer.substring(0, 200)}"`);
              const trimmed = buffer.trim();
              let content = trimmed;
              if (trimmed.startsWith("data: ")) {
                content = trimmed.substring(6);
              } else if (trimmed.startsWith("data:")) {
                content = trimmed.substring(5);
              }
              if (content.trim()) {
                try {
                  const parsed = JSON.parse(content);
                  if (parsed.text !== undefined) {
                    setText((prev) => prev + parsed.text);
                    eventCount++;
                  }
                } catch {
                  setText((prev) => prev + content);
                  eventCount++;
                }
              }
            }

            // 流结束但没有收到任何有效数据 → 视为失败
            if (eventCount === 0) {
              setError("AI 总结生成失败，请稍后重试");
            }

            setIsStreaming(false);
            setIsCompleted(true);
            break;
          }

          chunkSeq++;
          totalBytes += value.length;
          const chunkStr = decoder.decode(value, { stream: true });
          buffer += chunkStr;

          console.log(`${ts()} [AI-SSE] │ 📦 chunk#${chunkSeq}  size=${value.length}B  total=${totalBytes}B`);
          console.log(
            `${ts()} [AI-SSE] │    raw(${chunkStr.length}ch): "${chunkStr.substring(0, 250)}${chunkStr.length > 250 ? "..." : ""}"`,
          );

          // 按 \n 分割行 — 最后一段可能是不完整的行，留在 buffer 等下一次
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // 不完整的行回到 buffer

          if (lines.length > 0) {
            console.log(
              `${ts()} [AI-SSE] │    → 分割出 ${lines.length} 完整行，buffer残留(${buffer.length}ch): "${buffer.substring(0, 60)}"`,
            );
          }

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
              console.log(`${ts()} [AI-SSE] │    ⏭ 跳过空行`);
              continue;
            }

            console.log(
              `${ts()} [AI-SSE] │    📝 line(${line.length}ch): "${line.substring(0, 200)}${line.length > 200 ? "..." : ""}"`,
            );

            // 去掉 SSE "data: " 前缀
            let payload = line;
            if (line.startsWith("data: ")) {
              payload = line.substring(6);
            } else if (line.startsWith("data:")) {
              payload = line.substring(5);
            }

            // 尝试 JSON 解析
            try {
              const parsed = JSON.parse(payload);
              console.log(`${ts()} [AI-SSE] │    ✅ JSON 解析成功:`, JSON.stringify(parsed).substring(0, 200));

              // 根据后端 event type 分流处理
              // type: "start"  → 仅日志，不追加到 UI
              // type: "chunk"  → 追加 content 到 UI
              // type: "done"   → 标记完成，不追加到 UI
              if (parsed.type === "start") {
                console.log(`${ts()} [AI-SSE] │    🟢 start 事件: ${parsed.message || ""}`);
                // start 事件不追加文本
              } else if (parsed.type === "done") {
                console.log(`${ts()} [AI-SSE] │    🏁 done 事件: ${parsed.message || ""}`);
                // done 事件不追加文本，流自然结束
              } else if (parsed.type === "chunk" || parsed.content !== undefined) {
                const chunkText = parsed.content ?? "";
                setText((prev) => prev + chunkText);
                eventCount++;
                console.log(`${ts()} [AI-SSE] │    ➕ chunk: "${chunkText}"`);
              } else if (parsed.text !== undefined && parsed.text !== null) {
                setText((prev) => prev + parsed.text);
                eventCount++;
                console.log(`${ts()} [AI-SSE] │    ➕ text: "${String(parsed.text).substring(0, 80)}"`);
              } else if (parsed.message !== undefined) {
                console.log(`${ts()} [AI-SSE] │    💬 message: ${parsed.message}`);
              } else if (typeof parsed === "object" && Object.keys(parsed).length > 0) {
                const fallback = JSON.stringify(parsed);
                setText((prev) => prev + fallback);
                eventCount++;
                console.log(`${ts()} [AI-SSE] │    ➕ 序列化对象: "${fallback.substring(0, 80)}"`);
              } else {
                console.log(`${ts()} [AI-SSE] │    ⚠️ 空 JSON 对象，跳过`);
              }
            } catch {
              // 纯文本，直接追加
              setText((prev) => prev + payload);
              eventCount++;
              console.log(`${ts()} [AI-SSE] │    ➕ 追加纯文本: "${payload.substring(0, 80)}"`);
            }
          }
        }
      })
      .catch((err: any) => {
        resolved = true;
        clearInterval(watchdogTimer);
        if (err.name === "AbortError") {
          console.log(`${ts()} [AI-SSE] ⚠️ 请求被用户中断 (AbortError)`);
        } else {
          console.error(`${ts()} [AI-SSE] ❌ 流式请求异常:`);
          console.error(`${ts()} [AI-SSE]    name   : ${err.name}`);
          console.error(`${ts()} [AI-SSE]    message: ${err.message}`);
          console.error(`${ts()} [AI-SSE]    stack  : ${err.stack?.substring(0, 300)}`);
          setError(err?.message || "网络错误，请稍后重试");
        }
        setIsStreaming(false);
      });
  }, [articleId, cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setText("");
    setError(null);
    setIsStreaming(false);
    setIsCompleted(false);
  }, [cleanup]);

  // 组件卸载时中断请求
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    text,
    isStreaming,
    isCompleted,
    error,
    start,
    reset,
  };
}

export default useAiSummary;

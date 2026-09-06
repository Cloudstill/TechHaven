import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8088";

  const timeStamp = () => {
    const d = new Date();
    const ns = process.hrtime()[1];
    const us = Math.floor(ns / 1000)
      .toString()
      .padStart(6, "0");
    return `[${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${us}]`;
  };

  // 转发真实客户端 IP（后端 GetRemoteIP 优先读取 X-Real-IP 头）
  const setRealIp = (proxyReq: any, req: any) => {
    const ip = String(req.socket?.remoteAddress || req.headers["x-forwarded-for"] || "").replace(/^::ffff:/, "");
    if (ip) proxyReq.setHeader("X-Real-IP", ip);
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      host: true,
      proxy: {
        // SSE 流式端点 — 必须放在通用 /api/v1 规则之前
        "^/api/v1/article/ai-summary": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          timeout: 120000,
          configure: (proxy) => {
            proxy.on("error", (err, _req, _res) => {
              console.log(timeStamp(), "SSE代理错误:", err.message);
            });
            proxy.on("proxyReq", (proxyReq, req) => {
              console.log(timeStamp(), "SSE代理请求:", req.method, req.url);
              setRealIp(proxyReq, req);
            });
            proxy.on("proxyRes", (proxyRes, req) => {
              console.log(
                timeStamp(),
                "SSE代理响应:",
                proxyRes.statusCode,
                req.url,
                "| CT:",
                proxyRes.headers["content-type"],
                "| TE:",
                proxyRes.headers["transfer-encoding"],
              );
            });
          },
        },
        "^/api/v1": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("error", (err, _req, _res) => {
              console.log(timeStamp(), "代理错误:", err);
            });
            proxy.on("proxyReq", (proxyReq, req) => {
              console.log(timeStamp(), "代理请求:", req.method, req.url, "→ 转发到:", proxyReq.path);
              setRealIp(proxyReq, req);
            });
            proxy.on("proxyRes", (proxyRes, req) => {
              console.log(timeStamp(), "代理响应:", proxyRes.statusCode, req.url);
            });
          },
        },
        "^/file(.*)": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          timeout: 100000,
          agent: false,
          configure: (proxy) => {
            proxy.on("error", (err, _req, _res) => {
              console.log(timeStamp(), "文件代理错误:", err.message);
            });
            proxy.on("proxyReq", (proxyReq, req) => {
              console.log(timeStamp(), "文件代理请求:", req.method, req.url, "→ 转发到:", proxyReq.path);
              setRealIp(proxyReq, req);
              proxyReq.setHeader("Connection", "keep-alive");
            });
            proxy.on("proxyRes", (proxyRes, req) => {
              console.log(timeStamp(), "文件代理响应:", proxyRes.statusCode, req.url);
            });
          },
        },
        // WebSocket 代理（通知 / 在线 / 聊天）
        "^/ws/v1": {
          target: env.VITE_WS_URL || "ws://127.0.0.1:8091",
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

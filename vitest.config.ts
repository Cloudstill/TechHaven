import { defineConfig } from "vitest/config";

// 根前端单测：jsdom 环境（Mermaid 渲染、HTTP 拦截器均依赖 DOM/浏览器全局）
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});

import type { MermaidConfig } from "mermaid";

/**
 * Mermaid 全局配置。
 *
 * 组件与回归测试共用这一份配置，避免"测试断言 strict、组件实际 loose"的漂移。
 *
 * securityLevel 必须是 "strict"：渲染结果经 DOMPurify 过滤，标签内的
 * HTML/脚本/事件注入不会进入最终 SVG；回退到 loose 会打开注入面。
 * 对应的恶意输入回归测试见同目录 MermaidComponent.test.ts。
 */
export const MERMAID_INIT_CONFIG: MermaidConfig = {
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  flowchart: {
    useMaxWidth: true,
    curve: "basis",
  },
};

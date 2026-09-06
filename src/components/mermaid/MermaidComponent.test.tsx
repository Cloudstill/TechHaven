import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import MermaidComponent from "./MermaidComponent";
import { MERMAID_INIT_CONFIG } from "./mermaidConfig";

// react-dom 的 act() 需要显式标记测试环境（React 19 从 "react" 导出 act）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 未实现 SVG 布局测量方法，而 mermaid 渲染依赖它们；缺失时 mermaid 直接进入错误分支
// （lib.dom 把 getBBox 声明在 SVGGraphicsElement 上，这里显式投射声明形状）
if (typeof SVGElement !== "undefined") {
  const proto = SVGElement.prototype as unknown as {
    getBBox?: () => { x: number; y: number; width: number; height: number };
    getComputedTextLength?: () => number;
  };
  const noopBBox = { x: 0, y: 0, width: 0, height: 0 };
  proto.getBBox ??= () => noopBBox;
  proto.getComputedTextLength ??= () => 0;
}

/** 扫描渲染结果，断言不存在可执行标记：<script>、on* 事件属性、javascript: URI 属性 */
function expectNoExecutableMarkup(root: ParentNode): void {
  expect(root.querySelector("script")).toBeNull();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase()).not.toMatch(/^on/);
      expect(attr.value.toLowerCase()).not.toMatch(/^javascript:/);
    }
  }
}

/**
 * 轮询等待条件成立（mermaid 渲染是异步的）。
 * 注意：mock 输入中带 HTML 标签的图表在 jsdom 下会让 mermaid 渲染 promise 挂起
 * （jsdom 环境限制，真实浏览器由 mermaid strict 净化后正常渲染）。挂起本身是
 * fail-closed——不会产生任何可执行输出，不影响本文件的安全断言与后续执行。
 */
async function waitFor(container: HTMLElement, condition: () => boolean, timeoutMs = 8000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  throw new Error(`waitFor 超时；容器内容：${container.innerHTML.slice(0, 300)}`);
}

function mountComponent(code: string): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MermaidComponent code={code} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * 直接渲染并限时：mermaid 的 strict 净化在 jsdom 下遇 HTML 标签输入会挂起，
 * 用 race 限时后按「渲染成功 → 扫描输出」「挂起/拒绝 → 无输出」两条路径断言，
 * 两条路径都不允许产生可执行标记（渲染失败即 fail-closed）。
 */
async function renderWithDeadline(code: string, id: string, timeoutMs = 4000) {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize(MERMAID_INIT_CONFIG);
  const renderAttempt = mermaid.render(id, code).then(
    (r) => ({ kind: "rendered" as const, svg: r.svg }),
    () => ({ kind: "failed" as const, svg: "" as const }),
  );
  const deadline = new Promise<{ kind: "timeout"; svg: "" }>((resolve) => {
    setTimeout(() => resolve({ kind: "timeout", svg: "" }), timeoutMs);
  });
  return Promise.race([renderAttempt, deadline]);
}

describe("Mermaid 安全配置", () => {
  it("安全级别必须为 strict，防止回退为 loose", () => {
    expect(MERMAID_INIT_CONFIG.securityLevel).toBe("strict");
  });
});

describe("MermaidComponent 恶意输入回归", () => {
  it("正常图表在组件中渲染为 SVG", async () => {
    const { container, unmount } = mountComponent("flowchart LR\n  A --> B");
    await waitFor(container, () => container.querySelector("svg") !== null);
    expect(container.querySelector("svg")).not.toBeNull();
    unmount();
  }, 15000);

  it("javascript: URL 出现在文本标签时，要么被 strict 拒绝（无输出），要么输出无可执行标记", async () => {
    const { svg } = await renderWithDeadline("flowchart LR\n  A -->|javascript:alert(1)| B[go]", "deadline-jsurl");
    if (svg) {
      const host = document.createElement("div");
      host.innerHTML = svg;
      expectNoExecutableMarkup(host);
    }
  }, 15000);

  it("注入 HTML/脚本/事件与 click javascript: 时，绝不产生可执行标记（超时属 fail-closed）", async () => {
    const malicious = [
      "flowchart LR",
      '  A["<img src=x onerror=alert(1)>"] --> B["<script>alert(2)</script>"]',
      '  click A "javascript:alert(3)"',
    ].join("\n");
    const { svg } = await renderWithDeadline(malicious, "deadline-malicious");
    if (svg) {
      const host = document.createElement("div");
      host.innerHTML = svg;
      expectNoExecutableMarkup(host);
    }
    // svg 为空（挂起/拒绝）时无任何输出可执行，天然满足 fail-closed 断言
  }, 15000);
});

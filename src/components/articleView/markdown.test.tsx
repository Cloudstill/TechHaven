import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it, vi } from "vitest";
import { articleMarkdownComponents, articleMarkdownPlugins } from "./markdown";

vi.mock("../mermaid/MermaidComponent", () => ({ default: ({ code }: { code: string }) => <span data-mermaid={code} /> }));

describe("shared article Markdown", () => {
  const styles = Object.fromEntries(
    ["inlineCode", "mermaidWrapper", "codeBlockWrapper", "codeHeader", "languageTag", "copyButton", "codeBlock"].map((key) => [
      key,
      key,
    ]),
  );
  const base = {
    styles,
    paragraph: undefined,
    heading:
      (level: number) =>
      ({ children }: { children?: React.ReactNode }) =>
        React.createElement(`h${level}`, {}, children),
    onCopy: vi.fn(),
  };
  it("retains Markdown text, math and Mermaid in editor and reader modes", () => {
    for (const reader of [false, true]) {
      const components = articleMarkdownComponents({
        ...base,
        trimCode: reader,
        unwrapPre: reader,
        ...(reader ? { renderCode: (text: string) => <div data-highlight>{text}</div> } : {}),
      });
      const html = renderToStaticMarkup(
        <ReactMarkdown {...articleMarkdownPlugins} components={components}>
          {"# Title\n\n**bold** and `inline` and $x^2$\n\n```js\nlet x = 1;\n```\n\n```mermaid\ngraph TD; A-->B;\n```"}
        </ReactMarkdown>,
      );
      expect(html).toContain("<h1>Title</h1>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain('class="inlineCode"');
      expect(html).toContain('class="katex"');
      expect(html).toContain('data-mermaid="graph TD; A--&gt;B;"');
      expect(html.includes("data-highlight")).toBe(reader);
      expect(html.includes('class="codeBlock"')).toBe(!reader);
    }
  });
});

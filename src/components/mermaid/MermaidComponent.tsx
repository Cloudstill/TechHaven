import React, { useEffect, useRef, useState } from "react";
import styles from "./MermaidComponent.module.css";
import { MERMAID_INIT_CONFIG } from "./mermaidConfig";

type MermaidInstance = Awaited<typeof import("mermaid")>["default"];

let mermaidPromise: Promise<MermaidInstance> | null = null;

// 按需加载 mermaid 并初始化全局配置（仅执行一次；配置与回归测试共用，见 mermaidConfig.ts）
const getMermaid = (): Promise<MermaidInstance> => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize(MERMAID_INIT_CONFIG);
      return mermaid;
    });
  }
  return mermaidPromise;
};

interface MermaidComponentProps {
  code: string;
}

const MermaidComponent: React.FC<MermaidComponentProps> = ({ code }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    if (elementRef.current) {
      getMermaid()
        .then((mermaid) => {
          if (cancelled) return;
          const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          return mermaid.render(id, code).then(({ svg }) => {
            if (!cancelled && elementRef.current) {
              elementRef.current.innerHTML = svg;
            }
          });
        })
        .catch((err: any) => {
          if (!cancelled) {
            setError(`Mermaid 渲染错误: ${err.message}`);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className={styles.error}>
        <div className={styles.errorMessage}>{error}</div>
        <pre className={styles.errorCode}>{code}</pre>
      </div>
    );
  }

  return <div ref={elementRef} className={styles.diagram} />;
};

export default MermaidComponent;

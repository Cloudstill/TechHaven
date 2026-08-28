/**
 * TechHaven Agent Gateway 入口（P1 骨架，TH-RFC-001 §05.1）：
 * 载入配置 → 组装引擎驱动 → 会话注册表 → HTTP/SSE 服务 → 优雅关闭。
 */
import { loadConfig, ConfigError, type Config } from "./config.js";
import { log } from "./log.js";
import { errorMessage } from "./util.js";
import { MockDriver } from "./drivers/mock.js";
import { DshSdkDriver, type DshSdkDriverOptions } from "./drivers/dsh.js";
import { SessionRegistry } from "./sessions.js";
import { createGatewayServer } from "./http.js";
import type { EngineDriver } from "./types.js";

/**
 * 组装引擎驱动：mock 直接构造；dsh 静态导入构造（drivers/dsh.ts 已交付，
 * 恢复 tsc 对其的静态检查；SDK 包本身仍由 dsh.ts 在 startSession 阶段动态加载，包缺失不影响构建）。
 */
function createDriver(config: Config): EngineDriver {
  if (config.driver === "mock") return new MockDriver();
  try {
    // 选项键名对齐 DshSdkDriverOptions：profile（非 dshProfile）
    const options: DshSdkDriverOptions = {
      dshBin: config.dshBin,
      profile: config.dshProfile,
      dshHome: config.dshHome,
    };
    return new DshSdkDriver(options);
  } catch (err) {
    log(`dsh 驱动初始化失败（SDK 未安装或初始化失败，安装与排查见 services/techhaven-gateway/docs/DSH_SDK.md）：${errorMessage(err)}`);
    log("如需本地演示，请设置 TECHHAVEN_ENGINE_DRIVER=mock");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) log(`配置错误：${err.message}`);
    else log("配置载入失败：", err);
    process.exit(1);
  }

  log(
    `启动：driver=${config.driver} port=${config.port} dataDir=${config.dataDir} ` +
      `maxSessionsPerOrg=${config.maxSessionsPerOrg} ` +
      `sessionRetentionMinutes=${config.sessionRetentionMinutes} sessionIdleTimeoutMinutes=${config.sessionIdleTimeoutMinutes}`,
  );

  const driver = createDriver(config);

  const registry = new SessionRegistry(driver, {
    dataDir: config.dataDir,
    maxSessionsPerOrg: config.maxSessionsPerOrg,
    sessionRetentionMinutes: config.sessionRetentionMinutes,
    sessionIdleTimeoutMinutes: config.sessionIdleTimeoutMinutes,
  });
  const server = createGatewayServer(config, registry);
  server.on("error", (err) => {
    log(`HTTP 服务错误（端口 ${config.port} 可能被占用）：`, err);
    process.exit(1);
  });
  server.listen(config.port, () => {
    log(`监听 http://127.0.0.1:${config.port}（鉴权：Authorization: Bearer <TECHHAVEN_GATEWAY_TOKEN>）`);
  });

  // 兜底：泵与订阅链路已各自容错；这两类全局异常只记日志，避免静默丢失
  process.on("unhandledRejection", (reason) => log("未处理的 Promise 拒绝：", reason));
  process.on("uncaughtException", (err) => {
    log("未捕获异常，退出：", err);
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`收到 ${signal}，优雅关闭…`);
    server.close(() => log("HTTP 服务已关闭"));
    // 关闭全部 SSE 订阅 + dispose 引擎句柄 / 驱动 + 冲刷 JSONL 写流；5s 兜底强制退出（防 SSE 连接拖延）
    void Promise.allSettled([registry.dispose(), driver.dispose()]).then(() => {
      log("已释放全部会话与驱动，退出");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log("启动失败：", err);
  process.exit(1);
});

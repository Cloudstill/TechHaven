#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DEFAULT_PROPOSAL_TTL_MINUTES, DEFAULT_PROPOSALS_FILE } from "./config.js";
import { ProposalStore } from "./proposals/store.js";
import { log } from "./log.js";

/**
 * 写提案人工审批 CLI（staged 写模式的「人批」入口；TH-RFC-001 §07「事前守护」）
 *
 *   npm run proposal -- list
 *   npm run proposal -- approve <提案ID>
 *   npm run proposal -- reject <提案ID> [原因]
 *
 * 与 MCP server 通过同一份 JSONL 事件文件交接：server 每次读都重读文件，
 * 因此这里批准后，agent 下一次调用 get_proposal 即会触发 server 校验并应用变更。
 */

const USAGE = `用法：
  npm run proposal -- list
  npm run proposal -- approve <提案ID>
  npm run proposal -- reject <提案ID> [原因]
环境变量：TECHHAVEN_PROPOSALS_FILE（默认 ./audit/proposals.jsonl）、
          TECHHAVEN_PROPOSAL_TTL_MINUTES（默认 30，仅影响 server 侧新建提案的过期时间）`;

/** 打开提案存储。不走 loadConfig：CLI 是人工工具，不需要 agent token / 后端配置，只读提案存储相关两项 */
function openStore(): ProposalStore {
  const file = process.env.TECHHAVEN_PROPOSALS_FILE?.trim() || DEFAULT_PROPOSALS_FILE;
  const ttlRaw = process.env.TECHHAVEN_PROPOSAL_TTL_MINUTES?.trim() || String(DEFAULT_PROPOSAL_TTL_MINUTES);
  const ttl = Number(ttlRaw);
  return new ProposalStore(file, Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_PROPOSAL_TTL_MINUTES);
}

function listCmd(store: ProposalStore): void {
  const rows = store.list();
  if (rows.length === 0) {
    console.log("（暂无提案）");
    return;
  }
  console.log(`共 ${rows.length} 条提案：`);
  for (const { detail, status } of rows) {
    console.log(
      [
        `  ${detail.id}  [${status}]  ${detail.kind}#${detail.subjectHashId}  ${detail.fromStatus} → ${detail.toStatus}`,
        `      原因：${detail.reason}`,
        `      过期：${detail.expiresAt}`,
      ].join("\n"),
    );
  }
}

function approveCmd(store: ProposalStore, id: string): void {
  const state = store.getState(id);
  if (state.status === "unknown") {
    console.error(`✗ 提案不存在：${id}（可用 list 查看全部提案）`);
    process.exit(1);
  }
  if (state.status !== "pending") {
    console.error(`✗ 提案 ${id} 当前状态为 ${state.status}，只有 pending 可以批准`);
    process.exit(1);
  }
  store.appendEvent("approved", id, "user:cli");
  console.log(
    `✓ 已批准 ${id}（${state.detail.kind}#${state.detail.subjectHashId} ${state.detail.fromStatus} → ${state.detail.toStatus}）`,
  );
  console.log("  agent 下一次调用 get_proposal 时，server 将校验状态机并应用该变更。");
}

function rejectCmd(store: ProposalStore, id: string, reason: string): void {
  const state = store.getState(id);
  if (state.status === "unknown") {
    console.error(`✗ 提案不存在：${id}（可用 list 查看全部提案）`);
    process.exit(1);
  }
  if (state.status !== "pending") {
    console.error(`✗ 提案 ${id} 当前状态为 ${state.status}，只有 pending 可以拒绝`);
    process.exit(1);
  }
  store.appendEvent("rejected", id, "user:cli", reason || undefined);
  console.log(`✓ 已拒绝 ${id}${reason ? `（原因：${reason}）` : ""}`);
}

async function main(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true, options: {} });
  const cmd = positionals[0];
  const store = openStore();

  if (cmd === "list") {
    listCmd(store);
    return;
  }

  if (cmd === "approve") {
    const id = positionals[1];
    if (!id) {
      console.error("approve 需要提案 ID 参数");
      console.error(USAGE);
      process.exit(1);
    }
    approveCmd(store, id);
    return;
  }

  if (cmd === "reject") {
    const id = positionals[1];
    if (!id) {
      console.error("reject 需要提案 ID 参数");
      console.error(USAGE);
      process.exit(1);
    }
    // 原因可含空格：剩余位置参数原样拼接
    const reason = positionals.slice(2).join(" ").trim();
    rejectCmd(store, id, reason);
    return;
  }

  console.error(USAGE);
  process.exit(1);
}

main().catch((e) => {
  log(e);
  process.exit(1);
});

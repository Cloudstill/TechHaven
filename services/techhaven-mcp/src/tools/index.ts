import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READ_SCOPE, WRITE_SCOPE, type AgentTokenPayload, type Scope } from "../auth/agentToken.js";
import { IllegalTransitionError } from "../domain/stateMachine.js";
import type { TicketKind, TicketPage, TicketRecord, TrendSummary } from "../domain/types.js";
import { DomainError, type TechHavenClient } from "../techhaven/client.js";
import { sha256Digest, type AuditLog } from "../audit.js";
import { decodeId, encodeId, type HashIdScope } from "../hashid.js";
import type { SemanticsProvider } from "../semantics/types.js";

export interface ToolContext {
  client: TechHavenClient;
  session: AgentTokenPayload;
  audit: AuditLog;
  /** 语义层：提供字段业务含义与指标口径（供 get_semantics 读取） */
  semantics: SemanticsProvider;
}

type ToolResult = { content: [{ type: "text"; text: string }]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** 出参 ID 一律经 hashId 编码（防枚举），对齐 TechHaven 前端编码 */
function ticketSummary(t: TicketRecord) {
  return {
    id: encodeId(t.id, t.kind),
    kind: t.kind,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee || "(未指派)",
    updatedAt: t.updatedAt,
  };
}

function ticketDetail(t: TicketRecord) {
  return { ...ticketSummary(t), description: t.description, creator: t.creator, createdAt: t.createdAt };
}

function pageOut(p: TicketPage) {
  return { total: p.total, page: p.page, pageSize: p.pageSize, items: p.items.map(ticketSummary) };
}

const KINDS = ["requirement", "bug", "task"] as const;
const KIND_DESC = "工单类型：requirement=需求 | bug=缺陷 | task=任务";

/**
 * 统一守卫：scope 校验 → 审计（allow/deny 各一条，含参数摘要与耗时）→ 执行。
 * 设计依据：TH-RFC-001 §05.2（读写分离 scope）、§07（审计）。
 */
async function guard(
  ctx: ToolContext,
  tool: string,
  need: Scope | null,
  args: unknown,
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  const started = Date.now();
  const base = {
    ts: new Date().toISOString(),
    session: ctx.session.sid,
    org: ctx.session.org,
    actor: "agent" as const,
    tool,
    argsDigest: sha256Digest(args),
  };

  if (need && !ctx.session.scopes.includes(need)) {
    ctx.audit.append({ ...base, decision: "deny", reason: `缺少 scope ${need}`, latencyMs: 0 });
    return err(`权限不足：本次会话缺少 ${need} scope，无法调用 ${tool}`);
  }

  try {
    const out = await fn();
    ctx.audit.append({ ...base, decision: "allow", latencyMs: Date.now() - started });
    return ok(out);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "执行异常";
    ctx.audit.append({ ...base, decision: "allow", reason, latencyMs: Date.now() - started });
    if (e instanceof DomainError || e instanceof IllegalTransitionError) {
      return err(reason);
    }
    throw e; // 非预期错误交给 MCP 层
  }
}

/** P0 工具目录：5 读 + 1 写（含语义层读取 get_semantics，TH-RFC-001 §05.3）。add_ticket_comment / create_bug 属 P1。 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const org = ctx.session.org;

  server.registerTool(
    "get_ticket",
    {
      title: "获取工单详情",
      description: "读取一张工单（需求/缺陷/任务）的完整内容。需要 rd:read。",
      inputSchema: {
        kind: z.enum(KINDS).describe(KIND_DESC),
        id: z.string().describe("工单 hashId（其他工具返回的 id 字段，不可自行构造）"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guard(ctx, "get_ticket", READ_SCOPE, args, async () => {
        const rec = await ctx.client.getTicket(org, args.kind, requireNumericId(args.id, args.kind));
        return rec ? ticketDetail(rec) : { notFound: true, kind: args.kind, id: args.id };
      }),
  );

  server.registerTool(
    "list_my_tickets",
    {
      title: "列出组织工单",
      description: "列出当前 agent 所属组织的工单（可按类型与状态过滤，单页上限 50）。需要 rd:read。",
      inputSchema: {
        kind: z.enum(KINDS).optional().describe(KIND_DESC + "；不传=全部类型"),
        status: z.string().optional().describe("按状态过滤（如 new / processing / doing）"),
        page: z.number().int().min(1).optional().describe("页码，默认 1"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guard(ctx, "list_my_tickets", READ_SCOPE, args, async () =>
        pageOut(
          await ctx.client.listTickets(org, {
            kind: args.kind as TicketKind | undefined,
            status: args.status,
            page: args.page,
            pageSize: 20,
          }),
        ),
      ),
  );

  server.registerTool(
    "search_requirements",
    {
      title: "搜索需求",
      description: "按关键词与优先级搜索本组织需求。需要 rd:read。",
      inputSchema: {
        query: z.string().optional().describe("标题/描述关键词"),
        priority: z.enum(["high", "medium", "low"]).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guard(ctx, "search_requirements", READ_SCOPE, args, async () =>
        pageOut(
          await ctx.client.searchRequirements(org, {
            query: args.query,
            priority: args.priority,
            page: args.page,
            pageSize: 20,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_trend_summary",
    {
      title: "获取趋势摘要",
      description: "本组织近 N 天研发趋势摘要（各类型 open/closed 计数、窗口内新建/关闭数）。需要 rd:read。",
      inputSchema: {
        days: z.number().int().min(1).max(365).optional().describe("时间窗天数，默认 30"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guard(ctx, "get_trend_summary", READ_SCOPE, args, async () => {
        const summary: TrendSummary = await ctx.client.getTrendSummary(org, args.days ?? 30);
        return summary;
      }),
  );

  server.registerTool(
    "update_ticket_status",
    {
      title: "变更工单状态",
      description:
        "将工单变更为目标状态（须为合法迁移，非法迁移会被拒绝），必须说明原因。需要 rd:write。" +
        "注意：P0 阶段直接生效；P1 起将改为人工审批后生效（awaiting_permission）。",
      inputSchema: {
        kind: z.enum(KINDS).describe(KIND_DESC),
        id: z.string().describe("工单 hashId"),
        to_status: z.string().min(1).describe("目标状态（如 accepted / processing / done / closed）"),
        reason: z.string().min(4).describe("变更原因（会写入审计与工单轨迹）"),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      guard(ctx, "update_ticket_status", WRITE_SCOPE, args, async () => {
        const rec = await ctx.client.updateTicketStatus(
          org,
          args.kind,
          requireNumericId(args.id, args.kind),
          args.to_status,
          args.reason,
        );
        return { updated: ticketDetail(rec) };
      }),
  );

  server.registerTool(
    "get_semantics",
    {
      title: "获取业务语义",
      description:
        "语义层读取：返回某类工单（需求/缺陷/任务）的字段业务含义（物理列名 → 业务名/含义/示例、敏感标记），" +
        "可选一并返回指标口径定义。agent 在查询或改数前应先调用本工具理解数据——从猜 schema 变查口径。需要 rd:read。",
      inputSchema: {
        kind: z.enum(KINDS).describe(KIND_DESC),
        include_metrics: z.boolean().optional().describe("是否一并返回指标口径，默认 false"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      guard(ctx, "get_semantics", READ_SCOPE, args, async () => {
        const object = await ctx.semantics.describeObject(args.kind);
        if (!object) {
          return { notFound: true, kind: args.kind };
        }
        return args.include_metrics
          ? { object, metrics: await ctx.semantics.listMetrics() }
          : { object };
      }),
  );
}

function requireNumericId(hash: string, kind: TicketKind): number {
  const n = decodeId(hash, kind as HashIdScope);
  if (n === null || !Number.isFinite(n) || n <= 0) {
    throw new DomainError("BAD_ID", `无法解析工单 ID：${hash}（期望 kind=${kind} 的 hashId）`);
  }
  return n;
}

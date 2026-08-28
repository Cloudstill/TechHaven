# TechHaven Agent 平面数据层设计

**输入**：《TDSQL Nexa：面向 Agent 的统一数据平面！》（DTCC 2026 发布解读）+ TH-RFC-001《TechHaven × dsh 集成架构》§06
**产出**：[`schema.sql`](./schema.sql)（PostgreSQL 14+ DDL）——agent 平面的元数据与治理层
**相关实现**：`services/techhaven-mcp`（工具流 P0 骨架，含 DB 审计双写）

## 一句话定位

文章说「Agent = LLM + Context + Tool + Control」。我们的 **Tool** 已由 `services/techhaven-mcp` 实现；本设计补上另外两块的**数据底子**：Control（身份/配额/审计/事前守护）与 Context（mini 语义层）。**域数据不搬**——工单/需求/缺陷仍归产品后端，本层只存元数据，靠 ID 引用。

## 文章概念 → 本设计的映射

| 文章的痛点/理念 | 本设计的落地 | 表 |
|---|---|---|
| **Control**：Agent 独立身份、配额、操作边界 | agent 身份体系，与人的账号完全隔离 | `agent_identities` `agent_tokens` `agent_quotas` |
| **Control**：全链路审计、每次访问落盘 | 结构化工具调用台账（替代 JSONL）+ 引擎事件流 | `agent_tool_calls` `agent_events` |
| **Control**：事前守护——高风险进审批流 | 写操作一律**提案暂存 → 人批 → 应用**，未批不落库 | `agent_write_proposals` `org_tool_policy` |
| **Context**：Nexa Knowledge 语义层 | mini 语义层：物理字段 → 业务语义、指标口径显式化（人工策展起步） | `semantic_objects` `semantic_fields` `semantic_metrics` |
| **Context**：敏感数据按主体动态脱敏 | 字段级敏感标记 + 脱敏策略（供工具层执行） | `semantic_fields.sensitive / mask_policy` |
| **Tool**：一个平台找到全部工具、默认不启用 | 工具目录 + 组织级 opt-in 策略（对齐 dsh mcp 理念） | `tool_catalog` `org_tool_policy` |
| **失忆**：召回缺权限/时效过滤 | 所有查询强制 token 的组织绑定（MCP 层已实现）+ 敏感字段标记 | 复用 §05.2 + `semantic_fields` |
| **窒息**：脉冲式负载、资源隔离 | 配额四指标（并发/时长/日会话/日调用）+ 引擎一次性进程（架构层） | `agent_quotas` |
| **进化困难**：克隆/回滚/时光机 | 我们的对应物：写提案未批准=零副作用（天然回滚）+ 事件流可重放 | `agent_write_proposals` `agent_events` |
| **Agent Memory**（团队记忆 60%→80% 成功率） | 个体/团队两级记忆，团队记忆 = `identity_id IS NULL` | `agent_memory` |
| LangFuse 案例：Agent Trace 可观测 | `agent_events` 即 Trace，支持会话重放 | `agent_events` |

## 明确不做的事（边界）

- **不自建多引擎/智能路由/Iceberg-Lance 存储层**——那是 Nexa 本体，是腾讯云的产品；我们的域数据量级用不上，也不该造。
- **不做自动语义扫描**——Nexa Knowledge 自动翻译物理 schema；我们 P0 人工策展几十个字段即可启动，等 agent 调用量证明价值再谈自动化。
- **域表不进本库**——`requirements/bugs/tasks/users/organizations` 留在产品后端；跨库引用用 ID（后端同库则改 FK）。

## 与 services/techhaven-mcp 的衔接

| 现状（P0 代码） | 本设计就位后 |
|---|---|
| JSONL 审计（`audit.ts`） | **已实现双写**：`TECHHAVEN_DB_URL` 非空时同步写 `agent_tool_calls`（JSONL 永远保留为降级通道） |
| CLI 手动签发 token | 台账落 `agent_tokens`（存指纹不存密钥）；签发服务化仍归 P1 Gateway |
| 状态机直写 | 写工具改走 `agent_write_proposals`（P1），P0 先双写观察 |
| 工具硬编码 | 注册进 `tool_catalog` + `org_tool_policy` 治理 |
| agent 只能读物理字段含义 | `get_semantics` 工具（已实现，mock 语义层）：agent 从「猜 schema」变「查口径」；DB 就绪后切到 `semantic_*` 表 |

## 状态机与约束

- 会话状态机 = TH-RFC-001 图 2（`agent_session_status` 枚举）。
- 写提案 `expires_at` 未决自动过期 = 默认拒绝（安全侧倾斜，同图 2 审批超时语义）。
- `agent_events (session_id, seq)` 唯一 = 会话内事件可重放、不丢序。

## 保留策略

| 表 | 保留 | 理由 |
|---|---|---|
| `agent_events` | 90 天 | 观测数据，量大 |
| `agent_tool_calls` | 365 天 | 审计合规 |
| `agent_write_proposals` | 365 天 | 追责与回滚依据 |
| `agent_tokens` | 过期后 30 天 | 台账可核 |
| `agent_memory` | 按组织治理 | 陈旧经验会误导 agent，靠 `expires_at` |

## 落地顺序建议

1. **P0.5**：后端建表（Control 侧：identities/tokens/sessions/runs/tool_calls），MCP server 双写审计（已实现，设 `TECHHAVEN_DB_URL` 即启用）。
2. **P1**：`agent_write_proposals` 上线，写工具全部改走审批；Gateway 管理会话生命周期。
3. **P2**：语义层落库（`semantic_*` 表替代 mock）+ 配额生效；`agent_memory` 团队记忆。

# techhaven-mcp

TechHaven 研发平台的 **MCP Server（P0 PoC）**。把工单/需求/缺陷的领域操作暴露为 MCP 工具，供 dsh 等 agent 引擎挂载——这是 TH-RFC-001 集成设计里「**工具流**」（agent → TechHaven）的第一块实体。

> 设计文档：`../techhaven-dsh-integration.html`（TH-RFC-001）。本仓库只做 P0：6 读 + 1 写工具、离线 mock 演示、手动签发 agent token；写操作支持 `staged` 审批流（提案 → 人批 → 应用）。Gateway、云端沙箱属 P1/P2。

## 快速开始

```bash
npm install
npm run build

# 1) 签发一个 agent token（绑定 org 1，读写 scope，2 小时时效）
TECHHAVEN_TOKEN_SECRET=dev-only-secret-change-me \
  npm run token -- issue --org 1 --sid poc-1 --scopes rd:read,rd:write --ttl 2h

# 2) 端到端冒烟（自动起 server 进程、走完整 MCP 握手、调用全部关键路径）
TECHHAVEN_TOKEN_SECRET=dev-only-secret-change-me npm run smoke
```

smoke 通过即代表 P0 工具流闭环：握手 → 列工具 → 读工单 → 合法状态迁移成功 → **非法迁移被状态机拒绝** → 伪造 hashId 得到友好错误。随后自动跑 staged 写模式冒烟：提案暂存 → 人工批准 → `get_proposal` 应用 → 幂等 → 非法迁移建提案前快速失败。

## 运行模式

| 模式 | 说明 |
|---|---|
| `TECHHAVEN_BACKEND=mock`（默认） | 内置 8 条演示数据（3 需求 + 3 缺陷 + 2 任务，org 1），零依赖跑通全流程 |
| `TECHHAVEN_BACKEND=http` | 调真实后端 `/rd/*`（端点对齐前端 `rdPlatformService.ts`）。需要 `TECHHAVEN_SERVICE_TOKEN`（服务端到服务端凭据）；**待朋友侧 P0 交付后联调** |

agent token 只用于本服务与引擎之间的鉴权与审计，**不会**传给后端；后端调用使用独立的服务凭据。这落实了设计文档「凭据只在服务端，agent 只持 scoped token」的原则。

## 挂载到 dsh

dsh 侧通过 mcp-client 把本服务挂为外部工具源（stdio 方式，token 走 env 注入）。配置**示意**如下——字段名请以 dsh 仓库 `docs/config-catalog.md` 中 `mcp-client` 条目的实际 schema 为准：

```jsonc
// 示意：在 dsh 配置中新增一个 MCP server 条目（opt-in，默认不启用）
{
  "command": "node",
  "args": ["/绝对路径/techhaven-mcp/dist/index.js"],
  "env": {
    "TECHHAVEN_AGENT_TOKEN": "thm_v1....",        // 每会话签发一次
    "TECHHAVEN_TOKEN_SECRET": "dev-only-secret-change-me",
    "TECHHAVEN_BACKEND": "mock",
    "TECHHAVEN_AUDIT_FILE": "./audit/agent-audit.jsonl"
  }
}
```

挂载后 agent 即可原生调用 `get_ticket` / `list_my_tickets` / `search_requirements` / `get_trend_summary` / `get_semantics` / `get_proposal` / `update_ticket_status`。

## 工具目录（P0，7 工具 = 6 读 + 1 写）

| 工具 | scope | 说明 |
|---|---|---|
| `get_ticket` | rd:read | 读单张工单详情（kind: requirement/bug/task，hashId 入参） |
| `list_my_tickets` | rd:read | 列本组织工单，可按类型/状态过滤，单页上限 50 |
| `search_requirements` | rd:read | 按关键词/优先级搜需求 |
| `get_trend_summary` | rd:read | 近 N 天趋势摘要（各类型 open/closed、窗口内新建/关闭） |
| `get_semantics` | rd:read | 语义层读取：字段业务含义与指标口径（查数/改数前先读口径） |
| `get_proposal` | rd:read | 查询写提案状态；staged 模式下人工批准后再调它即触发应用并返回最终结果 |
| `update_ticket_status` | rd:write | 变更状态；**非法迁移一律拒绝**；必须附原因；staged 且列入分级审批清单时先建提案 |

P1 再加：`add_ticket_comment`（幂等键）、`create_bug`（去重窗口），同样纳入 staged 审批流。

## 写模式：direct / staged

`TECHHAVEN_WRITE_MODE` 控制写工具（目前是 `update_ticket_status`）的生效方式：

| 模式 | 行为 |
|---|---|
| `direct`（默认） | 变更直接生效（P0 现状，行为不变） |
| `staged` | 变更先存为**提案**（pending，带过期时间），人工批准后才由 server 应用 |

staged 流程（文字版时序）：

```
agent 调 update_ticket_status（合法迁移）
  → server 校验 scope + 状态机，创建提案（pending，TECHHAVEN_PROPOSAL_TTL_MINUTES 内有效），
    返回 { proposal: { id, status: "pending", to_status, expires_at } }   —— 变更未生效
  → 人工执行 `npm run proposal -- approve <id>`（或 reject / 放任过期）
  → agent 调 get_proposal { id }
  → server 检测到 approved：重读工单当前状态、重新过状态机 → 应用变更，补记 applied 事件
  → 返回 { id, status: "applied", updated: {...} }
```

要点：

- **快速失败**：工单不存在或迁移非法时直接报错，不产生提案——审批负担只留给合法请求。
- **批准后二次校验**：应用前 server 重读工单当前状态、重新过状态机；审批窗口内工单若已被人工改动且迁移不再合法，提案转 rejected 并返回说明，不会硬改。
- **未决过期 = 默认拒绝**（安全侧倾斜）：`TECHHAVEN_PROPOSAL_TTL_MINUTES`（默认 30 分钟）内未批准即 expired。
- **幂等**：已 applied 的提案重复查询不会重复应用。
- **分级审批（P2）**：staged 模式下只有列入 `TECHHAVEN_WRITE_STAGED_TOOLS`（默认 `update_ticket_status`）的写工具才走提案；未列入的写工具即使 staged 也直写，只读工具一律免审。
- 提案事件（created/approved/rejected/applied/expired，含操作者）落 `TECHHAVEN_PROPOSALS_FILE`（JSONL，append-only）；人工用 `npm run proposal -- list / approve / reject` 处理。

风险与边界：JSONL 提案存储仍是权威存储（单进程 server + 人工 CLI 偶发竞争可接受，每次读写重读折叠）；配置 `TECHHAVEN_DB_URL` 后同一事件会镜像落 `docs/agent-db` 的 `agent_write_proposals` 表（`proposal_ref` 存提案字符串 ID），列对照见 `src/proposals/dbSink.ts`。

## 工单状态机（须与后端对齐后冻结）

```
requirement: new → developing → testing → done → closed      （testing 可回退 developing）
bug:         new → accepted → processing → verified → closed （processing 可 reopened；closed 可 reopened）
task:        todo → doing → done → closed                    （doing 可回退 todo）
```

枚举来源：TechHaven `src/types/rdPlatform.ts`。**迁移规则是本仓库先拟的**，需要朋友后端确认。

## 审计

每次工具调用写一行 JSONL（`TECHHAVEN_AUDIT_FILE`，append-only）：时间、会话、组织、工具、参数摘要（SHA-256，不落原始参数）、allow/deny 与原因、耗时。趋势分析（P2）直接吃这份数据。

配置 `TECHHAVEN_DB_URL` 后同步双写 `agent_tool_calls`（`docs/agent-db/schema.sql` §3）；JSONL 永远是权威来源，DB 失败只记 stderr。

## 与 docs/agent-db 的衔接（P2 持久化）

`TECHHAVEN_DB_URL` 非空时，由 `PgContext`（`src/db/context.ts`）统一建连接池并 bootstrap `agent_identities` / `agent_sessions`，供三条落地路径共用；任一环节失败整体降级为「仅 JSONL 审计 + mock 语义层 + 提案只落 JSONL」：

| 能力 | DB 落点 | 状态 |
|---|---|---|
| 审计双写 | `agent_tool_calls`（JSONL 为主，DB 为增强） | 已实现 |
| 写提案落库 | `agent_write_proposals`（`proposal_ref` 映射提案字符串 ID；JSONL 事件流仍是权威，server 与人工 CLI 靠它交接） | 已实现 |
| 语义层 DB Provider | `semantic_objects` / `semantic_fields` / `semantic_metrics` 替代 mock（60s 内存缓存；查无时 `get_semantics` 返回 notFound） | Provider 已实现，**表数据待人工策展** |

分级审批：staged 写模式下仅 `TECHHAVEN_WRITE_STAGED_TOOLS` 清单中的写工具走提案审批；后续 `tool_catalog` / `org_tool_policy` 就位后，该清单改由组织级工具策略驱动。

## 与后端对齐清单（朋友侧 P0 事项）

- [ ] 服务凭据机制：接受 `TECHHAVEN_SERVICE_TOKEN`（Bearer）或指定替代方案
- [ ] `/rd/*` 端点在服务端到服务端调用下的鉴权行为确认
- [ ] 工单状态机迁移规则核对/修正
- [ ] `/rd/trends` 响应结构提供（当前 http 模式由列表端点聚合，上限 200/类）

## 目录结构

```
src/
  index.ts            # MCP Server 入口（stdio）
  cli.ts              # agent token 签发/校验 CLI
  proposalCli.ts      # 写提案人工审批 CLI（list / approve / reject）
  smoke.ts            # 端到端冒烟测试（direct 模式）
  smoke.staged.ts     # 端到端冒烟测试（staged 写模式：提案 → 人批 → 应用）
  config.ts           # 环境变量解析
  audit.ts            # JSONL 审计
  hashid.ts           # TechHaven hashId 镜像（同盐同长度）
  auth/agentToken.ts  # HMAC token：单会话 + 单组织 + scope + TTL
  db/context.ts       # DB 会话上下文（PgContext：pool + 身份/会话 bootstrap，三条落地路径共用）
  domain/             # 领域类型与工单状态机
  audit/dbSink.ts     # 审计 DB 双写（agent_tool_calls）
  proposals/store.ts  # 写提案事件存储（staged 写模式，JSONL append-only，权威）
  proposals/dbSink.ts # 写提案 DB 双写（agent_write_proposals）
  semantics/          # 语义层 Provider：mock（人工策展）/ db（semantic_* 表，60s 缓存）
  techhaven/          # 数据访问：mock / http 两实现
  tools/index.ts      # P0 工具注册（scope 守卫 + 审计 + 分级审批的 staged 提案分支）
```

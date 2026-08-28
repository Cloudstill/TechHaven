# techhaven-mcp

TechHaven 研发平台的 **MCP Server（P0 PoC）**。把工单/需求/缺陷的领域操作暴露为 MCP 工具，供 dsh 等 agent 引擎挂载——这是 TH-RFC-001 集成设计里「**工具流**」（agent → TechHaven）的第一块实体。

> 设计文档：`../techhaven-dsh-integration.html`（TH-RFC-001）。本仓库只做 P0：4 读 + 1 写工具、离线 mock 演示、手动签发 agent token。Gateway、人审批、云端沙箱均属 P1/P2。

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

smoke 通过即代表 P0 工具流闭环：握手 → 列工具 → 读工单 → 合法状态迁移成功 → **非法迁移被状态机拒绝** → 伪造 hashId 得到友好错误。

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

挂载后 agent 即可原生调用 `get_ticket` / `list_my_tickets` / `search_requirements` / `get_trend_summary` / `update_ticket_status`。

## 工具目录（P0）

| 工具 | scope | 说明 |
|---|---|---|
| `get_ticket` | rd:read | 读单张工单详情（kind: requirement/bug/task，hashId 入参） |
| `list_my_tickets` | rd:read | 列本组织工单，可按类型/状态过滤，单页上限 50 |
| `search_requirements` | rd:read | 按关键词/优先级搜需求 |
| `get_trend_summary` | rd:read | 近 N 天趋势摘要（各类型 open/closed、窗口内新建/关闭） |
| `update_ticket_status` | rd:write | 变更状态；**非法迁移一律拒绝**；必须附原因 |

P1 再加：`add_ticket_comment`（幂等键）、`create_bug`（去重窗口），且写工具全部改走人审批。

## 工单状态机（须与后端对齐后冻结）

```
requirement: new → developing → testing → done → closed      （testing 可回退 developing）
bug:         new → accepted → processing → verified → closed （processing 可 reopened；closed 可 reopened）
task:        todo → doing → done → closed                    （doing 可回退 todo）
```

枚举来源：TechHaven `src/types/rdPlatform.ts`。**迁移规则是本仓库先拟的**，需要朋友后端确认。

## 审计

每次工具调用写一行 JSONL（`TECHHAVEN_AUDIT_FILE`，append-only）：时间、会话、组织、工具、参数摘要（SHA-256，不落原始参数）、allow/deny 与原因、耗时。趋势分析（P2）直接吃这份数据。

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
  smoke.ts            # 端到端冒烟测试
  config.ts           # 环境变量解析
  audit.ts            # JSONL 审计
  hashid.ts           # TechHaven hashId 镜像（同盐同长度）
  auth/agentToken.ts  # HMAC token：单会话 + 单组织 + scope + TTL
  domain/             # 领域类型与工单状态机
  techhaven/          # 数据访问：mock / http 两实现
  tools/index.ts      # P0 工具注册（scope 守卫 + 审计）
```

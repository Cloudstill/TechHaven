# techhaven-gateway

TechHaven Agent Gateway（TH-RFC-001 §05.1）—— 引擎生命周期 / 会话管理 / 事件桥（SSE）/ 权限中继 / 基础配额。
零运行时依赖起步（`pg` 仅为可选的落库装载器引入），中文注释，TypeScript ESM Node16 strict。

数据流：`driver.startSession`（后台）→ 事件泵消费 `handle.events()` → 内存缓存 + `gateway.jsonl` 落盘 → SSE 订阅者。
终态（succeeded / failed / cancelled）后 dispose 引擎句柄并关闭 SSE；空闲超时由看门狗合成 failed 终态——「会话不悬空」。

## 快速开始

```bash
npm install
npm run build        # tsc -p tsconfig.json（编译 src/ 到 dist/）
npm run dev          # tsx src/index.ts
npm run smoke        # build + 端到端冒烟（spawn dist/index.js，22 项检查）
npm run load         # gateway.jsonl → PostgreSQL 装载（见下「事件落库」）
```

## 配置（见 `.env.example`）

| 变量 | 说明 |
|---|---|
| `TECHHAVEN_GATEWAY_TOKEN` | Bearer 令牌（必填，缺失拒绝启动） |
| `TECHHAVEN_GATEWAY_PORT` | HTTP 监听端口（默认 3091） |
| `TECHHAVEN_ENGINE_DRIVER` | `mock` / `dsh`（默认 mock） |
| `TECHHAVEN_GATEWAY_DATA_DIR` | JSONL 落盘目录（默认 `./data`，文件名固定 `gateway.jsonl`） |
| `TECHHAVEN_MAX_SESSIONS_PER_ORG` | 单组织活动会话配额（默认 3） |
| `TECHHAVEN_DB_URL` | 仅 `npm run load` 消费；网关运行时不读 |

## JSONL 行格式（`gateway.jsonl`，append-only）

| kind | 内容 | 说明 |
|---|---|---|
| `session` | `{ sid, patch: { status, orgId?, subjectType?, subjectId?, note? } }` | patch 行只在 create（全量归属 + 状态）与注册表释放收尾（status + note）时写；中途状态变化不写 patch 行 |
| `event` | `{ sid, event: <EngineEvent> }` | 引擎事件流（assistant_chunk / tool_call / tool_result / permission_request / status_change / error），事件行不含归属字段 |
| `permission` | `{ sid, orgId, requestId, decision, ts }` | 权限应答审计行（`orgId` 供装载器按组织归档） |

## 事件落库

`scripts/load-events.ts` 把 `gateway.jsonl` 装载进 `docs/agent-db/schema.sql` 定义的
`agent_identities` / `agent_sessions` / `agent_events`，列名与类型逐字对照 schema。

### 用法

```bash
# 连接串来自 env（必填，缺失退出并提示）
TECHHAVEN_DB_URL=postgres://postgres:postgres@127.0.0.1:5432/techhaven npm run load -- --file ./data/gateway.jsonl

# 或用 --url 覆盖（优先级高于 env）
npm run load -- --file ./data/gateway.jsonl --url postgres://postgres:postgres@127.0.0.1:5432/techhaven

# --file 缺省为 ./data/gateway.jsonl
TECHHAVEN_DB_URL=... npm run load
```

Windows PowerShell 下设置环境变量：`$env:TECHHAVEN_DB_URL = "postgres://..."` 后再执行。

### 幂等

同一文件可安全重跑：

- `agent_identities` 按 `UNIQUE (org_id, name)` upsert（name 固定 `techhaven-gateway`，kind `pipeline`，`created_by=0` 哨兵，与 techhaven-mcp `src/audit/dbSink.ts` 同约定），命中时把 `status` 复位为 `active`；
- `agent_sessions` 按 `sid` 唯一键 upsert，`started_at` 用 `COALESCE(库内值, 新值)` 保留最早起点，`ended_at` 只进不退；
- `agent_events` 按 `UNIQUE (session_id, seq)` `ON CONFLICT DO NOTHING`，重跑不产生重复事件行。

`started_at` / `ended_at` 是从事件行推导的尽力映射：`started_at` 取会话首个 `status_change: running` 事件的 ts（缺则退化为首条事件 ts），`ended_at` 取最后一个终态事件的 ts——推导规则同时保证 schema 的 `CHECK (ended_at IS NULL OR started_at IS NOT NULL)` 恒成立。会话最终 `status` 取文件序最后见到的状态（patch 行与 `status_change` 事件行合并推进）。

整文件读入内存、逐会话装载（PoC 规模足够，幂等可重跑）；单行 JSON 解析失败只计数并继续，不中断。

### permission 行为何不落库

`kind:"permission"` 行装载时**跳过**（只打印计数）：`agent_tool_calls` 的权威台账在
techhaven-mcp 侧（DB 双写见 `services/techhaven-mcp/src/audit/dbSink.ts`，其 session 维度绑定
MCP 自有会话与 identity）。gateway 的 permission 行只是「用户应答」的中继留痕，若在本侧再写
`agent_tool_calls` / `agent_write_proposals` 会造成双份审计与外键语义错位（gateway 侧并无
args_digest / risk_level / proposal 等权威字段）。审计留痕仍以 JSONL 为准。

### 装载目标 ↔ JSONL 来源 ↔ schema 出处（交叉核对表）

| 装载目标表 | JSONL 来源行 | schema 出处（文件:节） |
|---|---|---|
| `agent_identities` | `kind:"session"` patch 行（`orgId`；name/kind/created_by 为装载器固定值） | `docs/agent-db/schema.sql` §1 Control（agent_identities） |
| `agent_sessions` | `kind:"session"` patch 行（sid / orgId / status / 归属）+ `kind:"event"` 行（started_at / ended_at / 最新 status 推导） | `docs/agent-db/schema.sql` §2 会话 / 运行 / 事件流（agent_sessions） |
| `agent_events` | `kind:"event"` 行（`event` 去 seq/ts/type 后整体为 payload） | `docs/agent-db/schema.sql` §2 会话 / 运行 / 事件流（agent_events） |
| （不落库）`agent_tool_calls` | `kind:"permission"` 行 —— 只计数跳过，原因见上 | `docs/agent-db/schema.sql` §3 Control（agent_tool_calls，权威台账在 techhaven-mcp 侧） |

> **未经 live PostgreSQL 验证**（本机无 Docker/PG）：SQL 仅按 `docs/agent-db/schema.sql`
> 逐列静态核对（按 schema v0.2 口径核对，与 `services/techhaven-mcp/src/proposals/dbSink.ts`
> 的「schema.sql v0.2」引用一致；schema.sql 文件头仍标注 v0.1，版本号未同步），未在真实实例
> 上执行过 DDL / 装载。首次上库请先在测试库跑 `schema.sql`，再执行 `npm run load` 验证。

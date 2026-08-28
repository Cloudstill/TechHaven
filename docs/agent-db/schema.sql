-- ============================================================================
-- TechHaven Agent 平面数据层 · Schema v0.1
-- 依据：TH-RFC-001 §06 的扩展 + 《TDSQL Nexa：面向 Agent 的统一数据平面》理念
-- 范围：只覆盖「agent 平面」的元数据与治理层；
--       域数据（requirements/bugs/tasks/users/organizations）仍归产品后端所有，
--       本 schema 仅以 ID 引用，不重复定义。
-- 方言：PostgreSQL 14+（TDSQL-C / 云 PG 可直接用；MySQL 需按注释调整）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 枚举
-- ---------------------------------------------------------------------------
CREATE TYPE agent_session_status AS ENUM (
  'queued', 'running', 'awaiting_permission', 'succeeded', 'failed', 'cancelled'
);

CREATE TYPE tool_kind AS ENUM ('read', 'write');

CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');

CREATE TYPE proposal_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'expired');

CREATE TYPE run_outcome AS ENUM ('draft', 'delivered', 'applied', 'discarded');

-- ---------------------------------------------------------------------------
-- 1. Control：Agent 独立身份体系
--    文章依据：「Agent 拥有独立身份、配额、操作边界」
--    对齐：techhaven-mcp 的 agent token（sid + org + scopes + exp）
-- ---------------------------------------------------------------------------

-- agent 身份：一个引擎运行体一个身份，人是人、agent 是 agent，权限互不混用
CREATE TABLE agent_identities (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      BIGINT      NOT NULL,              -- → organizations.id（后端域表）
  name        TEXT        NOT NULL,
  kind        TEXT        NOT NULL DEFAULT 'assistant',  -- assistant | pipeline | one_shot
  status      TEXT        NOT NULL DEFAULT 'active',     -- active | suspended | revoked
  created_by  BIGINT      NOT NULL,              -- → users.id（签发这个身份的人）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- token 签发台账：只存指纹不存密钥；token 本体仍走 HMAC（见 services/techhaven-mcp/src/auth）
CREATE TABLE agent_tokens (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_id  BIGINT      NOT NULL REFERENCES agent_identities(id),
  sid          TEXT        NOT NULL UNIQUE,       -- 绑定单次引擎会话
  scopes       TEXT[]      NOT NULL,              -- {rd:read} | {rd:read,rd:write}
  token_fp     TEXT        NOT NULL,              -- sha256(token) 前 16 位，审计关联用
  issued_by    BIGINT,                            -- → users.id；P1 起为 gateway
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX idx_agent_tokens_identity ON agent_tokens (identity_id);

-- ---------------------------------------------------------------------------
-- 2. 会话 / 运行 / 事件流
--    文章依据：LangFuse 案例的 Agent Trace；「每一次变更都有版本记录和回滚能力」
--    对齐：TH-RFC-001 §06 的 agent_sessions / agent_runs + 图 2 状态机
-- ---------------------------------------------------------------------------

CREATE TABLE agent_sessions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sid            TEXT        NOT NULL UNIQUE,
  identity_id    BIGINT      NOT NULL REFERENCES agent_identities(id),
  org_id         BIGINT      NOT NULL,
  engine         TEXT        NOT NULL DEFAULT 'dsh',
  engine_version TEXT        NOT NULL,
  profile        TEXT,                              -- dsh 命名 profile（Gateway 下发）
  status         agent_session_status NOT NULL DEFAULT 'queued',
  quota_snapshot JSONB,                              -- 启动时的配额快照（事后可核）
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  exit_info      JSONB,                              -- 退出码 / 末条事件 / 失败原因
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NOT NULL)
);
CREATE INDEX idx_sessions_org_status ON agent_sessions (org_id, status);

-- 会话与业务对象的关联（工单/需求/缺陷/文章……）
CREATE TABLE agent_runs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    BIGINT      NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  subject_type  TEXT        NOT NULL,               -- requirement | bug | task | article | ...
  subject_id    BIGINT      NOT NULL,
  prompt_digest TEXT,                               -- sha256，原文不入库
  outcome       run_outcome NOT NULL DEFAULT 'draft',
  result_ref    TEXT,                               -- 产物引用（diff、报告…）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, subject_type, subject_id)
);
CREATE INDEX idx_runs_subject ON agent_runs (subject_type, subject_id);

-- 引擎事件流（Agent Trace）：token 流、工具活动、状态迁移，支持重放与观测
-- 注：量大；生产建议按月分区（PostgreSQL DECLARATIVE PARTITIONING），
--     PoC 阶段普通表 + 索引即可。
CREATE TABLE agent_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT      NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq        BIGINT      NOT NULL,                 -- 会话内单调递增
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  type       TEXT        NOT NULL,                 -- assistant_chunk | tool_call | tool_result
                                                   -- | status_change | permission_request | ...
  payload    JSONB       NOT NULL,
  UNIQUE (session_id, seq)
);

-- ---------------------------------------------------------------------------
-- 3. Control：工具调用台账（审计 + 血缘锚点）
--    文章依据：「每一次访问全部落盘可查」；替代 techhaven-mcp 的 JSONL 审计
-- ---------------------------------------------------------------------------

CREATE TABLE agent_tool_calls (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    BIGINT      NOT NULL REFERENCES agent_sessions(id),
  identity_id   BIGINT      NOT NULL REFERENCES agent_identities(id),
  org_id        BIGINT      NOT NULL,
  tool_name     TEXT        NOT NULL,
  tool_version  TEXT,
  args_digest   TEXT        NOT NULL,               -- sha256(args) 前 16 位
  args_redacted JSONB,                              -- 脱敏后参数（可选；默认只存摘要）
  decision      TEXT        NOT NULL,               -- allow | deny
  deny_reason   TEXT,
  risk_level    risk_level  NOT NULL DEFAULT 'low',
  proposal_id   BIGINT,                             -- 命中审批流的写操作 → agent_write_proposals
  latency_ms    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tool_calls_org_time ON agent_tool_calls (org_id, created_at);
CREATE INDEX idx_tool_calls_session  ON agent_tool_calls (session_id);

-- ---------------------------------------------------------------------------
-- 4. Control：事前守护 —— 写提案暂存（高风险→审批流）
--    文章依据：「权限校验+语义校验+风险预估在提交前完成，高风险操作自动进入审批流」
--    附加收益（对应「进化困难」）：未批准不落库 = 天然可回滚
--    演进：P0 状态直写（提案表仅记录）；P1 起写工具一律走提案 → 人批 → 应用
-- ---------------------------------------------------------------------------

CREATE TABLE agent_write_proposals (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id   BIGINT          NOT NULL REFERENCES agent_sessions(id),
  org_id       BIGINT          NOT NULL,
  tool_name    TEXT            NOT NULL,
  subject_type TEXT            NOT NULL,
  subject_id   BIGINT          NOT NULL,
  change       JSONB           NOT NULL,            -- { before, after, reason }
  risk_level   risk_level      NOT NULL,            -- 由状态机 + 工具策略共同判定
  status       proposal_status NOT NULL DEFAULT 'pending',
  decided_by   BIGINT,                              -- → users.id（批准/拒绝的人）
  decided_at   TIMESTAMPTZ,
  apply_note   TEXT,
  applied_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ      NOT NULL,            -- 未决自动过期 = 默认拒绝（安全侧倾斜）
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposals_pending ON agent_write_proposals (org_id, status)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Control：配额（对应「窒息」——脉冲式负载需要边界，不是峰值预留）
-- ---------------------------------------------------------------------------

CREATE TABLE agent_quotas (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      BIGINT      NOT NULL,
  identity_id BIGINT      REFERENCES agent_identities(id),  -- NULL = 组织级配额
  metric      TEXT        NOT NULL,   -- concurrent_sessions | session_minutes
                                      -- | daily_sessions | daily_tool_calls
  limit_value INTEGER     NOT NULL
);
-- NULL 不参与 UNIQUE 去重，用表达式唯一索引
CREATE UNIQUE INDEX uq_quotas ON agent_quotas (org_id, COALESCE(identity_id, 0), metric);

-- ---------------------------------------------------------------------------
-- 6. Tool：工具目录 + 组织级工具策略
--    文章依据：「Agent 怎么在一个平台里找到完成数据任务需要的全部工具」
--    对齐 dsh mcp-client 理念：nothing ships enabled，逐项 opt-in
-- ---------------------------------------------------------------------------

CREATE TABLE tool_catalog (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_name   TEXT        NOT NULL UNIQUE,          -- get_ticket / update_ticket_status / ...
  version     TEXT        NOT NULL,
  kind        tool_kind   NOT NULL,
  risk_level  risk_level  NOT NULL DEFAULT 'low',
  description TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT FALSE    -- 全局默认关闭
);

CREATE TABLE org_tool_policy (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id             BIGINT      NOT NULL,
  tool_name          TEXT        NOT NULL REFERENCES tool_catalog(tool_name),
  enabled            BOOLEAN     NOT NULL DEFAULT FALSE,
  require_approval   BOOLEAN     NOT NULL DEFAULT TRUE,   -- 写工具默认走提案审批
  rate_limit_per_hour INTEGER,
  UNIQUE (org_id, tool_name)
);

-- ---------------------------------------------------------------------------
-- 7. Context：语义层（mini Knowledge，人工策展起步）
--    文章依据：Nexa Knowledge —— 把 user_id 翻译成「用户唯一标识」、
--    order_status=3 翻译成「订单已签收」；指标口径显式化
--    边界声明：Nexa 是自动扫描 + 行业经验编码；我们 P0 只做人工策展，
--    价值点在于 agent 的工具从「读物理 schema」升级为「查业务语义」
-- ---------------------------------------------------------------------------

CREATE TABLE semantic_objects (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_table TEXT        NOT NULL UNIQUE,        -- requirements | bugs | tasks | ...
  biz_name      TEXT        NOT NULL,               -- 「缺陷」
  description   TEXT
);

CREATE TABLE semantic_fields (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object_id       BIGINT      NOT NULL REFERENCES semantic_objects(id) ON DELETE CASCADE,
  column_name     TEXT        NOT NULL,
  biz_name        TEXT        NOT NULL,             -- 「状态」
  biz_description TEXT,                             -- 「new=新建，accepted=已接受……」
  example         TEXT,
  sensitive       BOOLEAN     NOT NULL DEFAULT FALSE,
  mask_policy     TEXT,                             -- 敏感字段动态脱敏策略（Control 落点）
  UNIQUE (object_id, column_name)
);

CREATE TABLE semantic_metrics (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id  BIGINT      NOT NULL,
  name    TEXT        NOT NULL,                     -- 「缺陷解决时长」
  caliber TEXT        NOT NULL,                     -- 口径：verified − accepted（工作小时）
  sql_hint TEXT,                                    -- 参考实现 / 最佳实践
  owner   BIGINT,                                   -- → users.id（口径负责人）
  UNIQUE (org_id, name)
);

-- ---------------------------------------------------------------------------
-- 8. Agent Memory（文章同名单品的轻量对应物）
--    identity_id 为 NULL = 团队记忆（组织共享资产）；SWE-Pro 案例验证其价值
-- ---------------------------------------------------------------------------

CREATE TABLE agent_memory (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id         BIGINT      NOT NULL,
  identity_id    BIGINT      REFERENCES agent_identities(id),
  kind           TEXT        NOT NULL,   -- session_summary | lesson | preference | convention
  content        TEXT        NOT NULL,
  source_session BIGINT      REFERENCES agent_sessions(id),
  created_by     TEXT        NOT NULL DEFAULT 'agent',  -- agent | user:<id>
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ                           -- 记忆可过期，防止陈旧经验误导
);
-- 团队记忆的高频查询路径
CREATE INDEX idx_memory_team ON agent_memory (org_id, kind) WHERE identity_id IS NULL;

-- ---------------------------------------------------------------------------
-- 9. 便捷视图：审计总览（人看的地方）
-- ---------------------------------------------------------------------------
CREATE VIEW v_agent_audit AS
SELECT
  c.created_at,
  s.sid,
  i.name               AS identity_name,
  c.org_id,
  c.tool_name,
  c.decision,
  c.deny_reason,
  c.risk_level,
  p.status             AS proposal_status,
  c.latency_ms
FROM agent_tool_calls c
JOIN agent_sessions s ON s.id = c.session_id
JOIN agent_identities i ON i.id = c.identity_id
LEFT JOIN agent_write_proposals p ON p.id = c.proposal_id
ORDER BY c.created_at DESC;

-- ---------------------------------------------------------------------------
-- 10. 数据保留策略（建议，由后端定时任务执行）
-- ---------------------------------------------------------------------------
-- agent_events     : 保留 90 天（观测用，量大）
-- agent_tool_calls : 保留 365 天（审计合规要求）
-- agent_write_proposals: 保留 365 天
-- agent_memory     : 按组织治理，过期字段清理
-- agent_tokens     : 过期后 30 天清理台账

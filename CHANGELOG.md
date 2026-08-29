# Changelog

本项目所有重要变更均记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [Semantic Versioning](https://semver.org/)。

发版时请新增一个 `## [vX.Y.Z] - YYYY-MM-DD` 段落，CI 会自动将其作为 GitHub Release 的说明。

## [Unreleased]

### 新增
- Agent 集成（TH-RFC-001，P0–P1 完成、P2 部分完成）：设计文档 `docs/TH-RFC-001-agent-engine.md`；agent 平面数据层 `docs/agent-db/`（schema v0.2 + 语义层种子）。
- `services/techhaven-mcp/`：MCP Server（7 工具：get_ticket / list_my_tickets / search_requirements / get_trend_summary / get_semantics / get_proposal / update_ticket_status），agent token（HMAC、单会话+单组织+读写 scope），staged 写提案审批流（提案→人批→应用），审计 JSONL+PG 双写，语义层 mock/DB 双 Provider，dsh 挂载手册（真实 mcp-client 配置，含环境变量剥离陷阱）。
- `services/techhaven-gateway/`：Agent Gateway——引擎生命周期、HTTP API + SSE 事件桥（Last-Event-ID 回放、慢客户端背压）、权限中继、per-org 配额/空闲看门狗/终态 TTL 淘汰；事件 JSONL→PG 装载器（`npm run load`，幂等）。
- 前端样例页 `/test/agent-session-panel`（DEV）：Agent 会话面板（事件流/工具卡片/权限审批卡），复用自研组件库；待浏览器确认后集成业务页。

### 变更
- `docs/agent-db/schema.sql` v0.2：`agent_write_proposals` 增加 `proposal_ref TEXT UNIQUE` 列。

## [v1.0.0] - 2026-08-28

首个正式版本，对应当前 master 节点。

### 新增
- 首页侧边栏「每日一言」组件，调用一言（Hitokoto）公开接口，按日缓存并支持手动刷新。
- 主题风格选择面板，支持时代周刊、极简黑白、护眼豆绿、海洋蓝、樱花粉、赛博朋克、暗金奢华、薰衣草紫等风格。

### 变更
- 默认主题风格由「默认」改为「时代周刊」（纸刊衬线风），移除「默认」选项。
- CI/CD 改为基于 git tag（`v*`）发布：仅 tag 推送触发部署并生成 GitHub Release；master 推送与 PR 仅做构建检查。

### 其他
- 首页「订阅更新」卡片改为仅开发环境可见（功能尚未实现）。
- 部署版本目录由时间戳改为 tag 名称，与 Release 一一对应，便于回滚溯源。

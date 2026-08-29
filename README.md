# TechHaven（研发 × 博客一体化平台）

TechHaven 是一个集研发协作功能于一体的博客平台前端。除了常规的文章阅读/发布、个人中心、组织协作与管理后台之外，还内置了完整的研发平台（需求、缺陷、任务、代码评审、工单与趋势分析），面向技术团队打造"写作 + 研发"一体化的工作空间。

## 功能概览

- **博客内容**：首页信息流、文章发布/编辑、文章详情、Markdown 渲染（代码高亮、KaTeX 数学公式、Mermaid 图表）、AI 摘要（SSE 流式）
- **社区互动**：评论树、点赞、关注、订阅、在线人数与在线状态
- **组织协作**：组织列表/详情、组织申请、作业发布与提交
- **研发平台**：研发看板、需求/缺陷/任务管理、代码评审、我的工单、工单详情、趋势分析
- **管理后台**：用户、文章、作业、组织、评论、分类、媒体、数据、通知、系统设置
- **系统能力**：内存态 Token 认证、WebSocket 实时通知、维护模式守卫、明暗主题、页面宽度切换、分片上传、防调试保护

## 技术栈

- 框架：`React 19` + `TypeScript` + `Vite`
- 路由：`react-router-dom` v7
- 网络：`axios`（封装于 `src/utils/http.ts`）
- UI/可视化：`antd`、`echarts`、`lucide-react`、`react-icons`
- Markdown：`react-markdown`、`@uiw/react-markdown-preview`、`markdown-it`、`remark-*`、`rehype-*`、`katex`、`mermaid`、`highlight.js`
- 样式：CSS Modules（`*.module.css`）+ CSS 自定义属性（`data-theme` / `data-width-mode`）
- 工程化：`prettier`

> 项目还封装了完整的自定义 UI 组件库（`src/components/`），业务开发时应优先复用，详见 `AGENTS.md`。

## Agent 集成（TH-RFC-001）

平台在「博客 × 研发」之上引入了 Agent 能力：外壳归 TechHaven、引擎归 dsh、协议（SDK JSON-RPC / MCP）是边界。设计文档与实施现状：

- 设计：`docs/TH-RFC-001-agent-engine.md`（六条 ADR、架构图、路线图 P0–P3）
- 数据层：`docs/agent-db/schema.sql`（agent 身份/日志/提案/语义/记忆）+ `docs/agent-db/seed-semantics.sql`（语义层种子数据）
- `services/techhaven-mcp/`——MCP Server（工具流）：7 个工具（6 读 1 写）、agent token、staged 写提案审批流、审计 JSONL+PG 双写、语义层 mock/DB 双 Provider；含真实 dsh 挂载手册（`dsh/ATTACH.md`），`npm run smoke` 两套冒烟（9+11 项）
- `services/techhaven-gateway/`——Agent Gateway（驱动流）：引擎生命周期、HTTP API + SSE 事件桥、权限中继、配额/看门狗/TTL；事件 JSONL→PG 装载器（`npm run load`）；`npm run smoke` 22 项
- 前端：`/test/agent-session-panel`（DEV，`src/sample/AgentSessionPanel.tsx`）——会话面板样例页，走 AGENTS.md 组件流程，**待浏览器确认后集成业务页**

## 开发环境要求

- Node.js（建议使用较新的 LTS）
- npm（项目自带 `package-lock.json`）

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器
npm run build      # tsc 类型检查 + vite 生产构建
npm run preview    # 本地预览 dist/
npm run format     # Prettier 格式化 src/
```

## 环境变量与后端联调

环境变量见 `.env.development` / `.env.production`：

- `VITE_API_BASE_URL`：后端基地址（不走代理时使用）
- `VITE_WS_URL`：WebSocket 服务地址
- `VITE_USE_PROXY`：是否使用开发代理（`true` 时 HTTP 客户端默认以 `/api` 为 `baseURL`）
- `VITE_REQUIRE_CREDENTIALS`：是否开启 `withCredentials`

### 开发代理

`vite.config.ts` 配置了以下代理（目标默认 `http://127.0.0.1:8088`，由 `VITE_API_BASE_URL` 覆盖）：

- `^/api/v1/article/ai-summary`：AI 摘要 SSE 流式端点（需置于通用规则之前）
- `^/api/v1`：通用 API
- `^/file(.*)`：文件服务

## 主要页面路由

路由集中在 `src/router/RouterConfig.tsx`：

- `/` → 重定向到 `/index`
- `/index`：首页
- `/auth`：登录/注册/找回密码（不受维护模式限制）
- `/article/create`、`/article/edit/:id`：文章发布/编辑
- `/article/:id`：文章详情
- `/assignment/submit/:id`、`/assignment/submissions/:id`：作业提交与提交详情
- `/organizations/list`、`/organization/detail/:id`：组织列表与详情
- `/profile/:id`：用户资料
- `/personal`：个人中心
- `/rd`：研发平台（子路由 `trends`、`requirements`、`bugs`、`tasks`、`reviews`、`my-tickets` 及各自 `:id` 详情）
- `/admin`：管理后台（子路由 `users`、`articles`、`assignments`、`organizations`、`comments`、`categories`、`media`、`database`、`settings`、`notifications`，不受维护模式限制）

除 `/auth` 与 `/admin/*` 外，其余路由受 `MaintenanceGuard` 保护。管理后台说明另见 `src/pages/admin/README.md`。

## 目录结构

```
src/
  components/   # 自定义 UI 组件库（Button/Input/Modal/Message/Confirm/Navbar 等）
  contexts/     # 全局上下文（Theme/Auth/LayoutWidth/SiteSettings/RdOrg）
  hooks/        # 自定义 Hooks（AI 摘要、在线人数、空闲超时、防调试等）
  pages/        # 业务页面（home/auth/article/assignment/organization/personal/profile/rd-platform/admin/error/test）
  router/       # 路由配置
  services/     # API Service 封装（article/auth/organization/rdPlatform/notification 等）
  types/        # 全局类型定义
  utils/        # 工具与请求封装（http/websocket/cookie/hashId 等）
  sample/       # 组件测试样例页
```

## 架构要点

- **Provider 嵌套顺序**：BrowserRouter → Theme → Auth → LayoutWidth → SiteSettings → Message → Confirm
- **Token 认证**：从 Cookie 提取 `S_TOKEN`，存于内存 `TokenManager`，HTTP 拦截器自动附加 `Bearer` 头（敏感数据禁止落地 `localStorage`）
- **WebSocket**：`notificationWS` 单例，生命周期绑定 `AuthContext`（登录连、登出断），支持自动重连
- **HTTP**：`src/utils/http.ts` 拦截器内置完整的中文业务状态码映射

## 开发规范

组件优先复用、内存优先存储敏感数据等约定详见 `AGENTS.md`。每次修改完成后建议执行：

```bash
npm run build
npm run format
```

# 可选 Agent 界面

默认 `VITE_AGENT_ENABLED=false`。登录、文章、私信、研发平台和个人 AI 配置继续使用原后端；构建和运行无需安装 Agent 服务。

启用方式（PowerShell）：

```powershell
$env:VITE_AGENT_ENABLED = "true"
$env:TECHHAVEN_GATEWAY_PROXY_TOKEN = "与本机 Gateway 相同的开发令牌"
npm run dev
```

打开 `/rd/agent`，默认进入本地演示；`/rd/agent?driver=gateway` 连接独立服务。测试页面 `/test/agent-session-panel` 需要同时满足开发模式和 Agent 开关。关闭时隐藏导航、撤销路由，默认生产构建不输出 Agent 页面资源。

本地开发代理默认指向 `http://127.0.0.1:3091`，可用 `TECHHAVEN_GATEWAY_URL` 覆盖。固定的 `TECHHAVEN_GATEWAY_PROXY_ACTOR` 仅用于本机开发。生产需要站点的 Nginx/BFF 验证会话并注入可信用户身份；不能使用固定 actor 作为生产认证。功能开关也不是服务端权限控制。

独立服务仓库：`TechHaven-agent-services`，包含 Gateway、BFF、Bridge、MCP、数据库迁移及服务发布脚本。它与前端独立安装、检查、发布。前端不引用同级仓库源码，不保存管理令牌。

个人中心原有 AI 配置仍通过 `/api/v1/user/ai-config` 保存；Agent 页里的配置单独通过 `/gateway/v1/ai-configs` 访问。只有服务明确声明 legacy 模式才使用原配置存储，网络故障或鉴权失败不会触发自动回退。Agent 配置不可用时提供重试，不显示可误保存的空表单；普通请求 8 秒超时。Agent 会话连接失败时显示失败状态，不自动切换成演示结果。

## 检查

```sh
npm ci
npm test
npm run build
node scripts/check-agent-boundary.mjs
npm run check:agent-contract
```

跨仓库契约比对可显式执行：`npm run check:agent-contract -- <Agent服务仓库绝对路径>`。
`src/contracts/agent/index.d.ts` 是 0.1.0 类型契约副本，SHA-256 在 `version.json` 中固定，哈希按 LF 规范化。
修改契约时同步评审两个仓库、更新版本/哈希并运行集成验证。普通前端 CI 不依赖 Agent 仓库存在。

生产启用前设置 `VITE_AGENT_ENABLED=true` 后重新构建；回退时设置 false 重建并发布前端即可。服务数据库变更需按迁移记录单独处理，不与前端回退混用。

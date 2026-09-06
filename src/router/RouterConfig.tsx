import React, { lazy, Suspense } from "react";
import NotFound404 from "../pages/error/NotFound404";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "../pages/auth/AuthPage";
import MaintenanceGuard from "../components/maintenance/MaintenanceGuard";
import IndexPage from "../pages/home/IndexPage";
import AuthRequired from "../components/auth/AuthRequired";
import PageSkeleton from "../components/pageSkeleton/PageSkeleton";

// 首屏必需的页面保持静态引入：首页、登录页、404、路由守卫
// 其余页面按需加载，避免全部打进主包
const ArticleCreate = lazy(() => import("../pages/article/ArticleCreate"));
const Profile = lazy(() => import("../pages/profile/ProfilePage"));
const PersonalCenter = lazy(() => import("../pages/personal/PersonalCenter"));

const AdminLayout = lazy(() => import("../pages/admin/AdminLayout"));
const Dashboard = lazy(() => import("../pages/admin/Dashboard"));
const UserManagement = lazy(() => import("../pages/admin/UserManagement"));
const ArticleManagement = lazy(() => import("../pages/admin/ArticleManagement"));
const AssignmentManagement = lazy(() => import("../pages/admin/AssignmentManagement"));
const CategoryManagement = lazy(() => import("../pages/admin/CategoryManagement"));
const CommentManagement = lazy(() => import("../pages/admin/CommentManagement"));
const MediaManagement = lazy(() => import("../pages/admin/MediaManagement"));
const NotificationManagement = lazy(() => import("../pages/admin/NotificationManagement"));
const FeedbackManagement = lazy(() => import("../pages/admin/FeedbackManagement"));
const DataManagement = lazy(() => import("../pages/admin/DataManagement"));
const Settings = lazy(() => import("../pages/admin/Settings"));
const OrganizationManagement = lazy(() => import("../pages/admin/OrganizationManagement"));

const OrganizationList = lazy(() => import("../pages/organization/OrganizationList"));
const OrganizationDetail = lazy(() => import("../pages/organization/OrganizationDetail"));
const ArticleViewPage = lazy(() => import("../pages/article/ArticleViewPage"));
const AssignmentSubmit = lazy(() => import("../pages/assignment/AssignmentSubmit"));
const AssignmentSubmissions = lazy(() => import("../pages/assignment/AssignmentSubmissions"));

const ChunkUploadTest = lazy(() => import("../pages/test/ChunkUploadTest"));
const SampleThemeStylePanel = lazy(() => import("../sample/ThemeStylePanel"));

const AgentSessionPanel =
  import.meta.env.VITE_AGENT_ENABLED === "true" ? lazy(() => import("../pages/rd-platform/AgentSessionPanel")) : null;
const SampleAgentSessionPanel =
  import.meta.env.VITE_AGENT_ENABLED === "true" && import.meta.env.DEV ? lazy(() => import("../sample/AgentSessionPanel")) : null;

const RdLayout = lazy(() => import("../pages/rd-platform/RdLayout"));
const RdDashboard = lazy(() => import("../pages/rd-platform/Dashboard"));
const RequirementList = lazy(() => import("../pages/rd-platform/RequirementList"));
const BugList = lazy(() => import("../pages/rd-platform/BugList"));
const TaskList = lazy(() => import("../pages/rd-platform/TaskList"));
const MyTickets = lazy(() => import("../pages/rd-platform/MyTickets"));
const CodeReviewList = lazy(() => import("../pages/rd-platform/CodeReviewList"));
const TicketDetail = lazy(() => import("../pages/rd-platform/TicketDetail"));
const TrendAnalysis = lazy(() => import("../pages/rd-platform/TrendAnalysis"));

const HelpCenter = lazy(() => import("../pages/user/HelpCenter"));
const Messages = lazy(() => import("../pages/user/Messages"));

const RouterConfig: React.FC = () => {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {/* 默认路由重定向到主页 */}
        <Route path="/" element={<Navigate to="/index" replace />} />

        {/* 登录页不受维护模式限制（管理员需要登录后台） */}
        <Route path="/auth" element={<AuthPage />} />

        {/* 管理中心不受维护模式限制（管理员需要关闭维护模式） */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="articles" element={<ArticleManagement />} />
          <Route path="assignments" element={<AssignmentManagement />} />
          <Route path="organizations" element={<OrganizationManagement />} />
          <Route path="comments" element={<CommentManagement />} />
          <Route path="categories" element={<CategoryManagement />} />
          {import.meta.env.DEV && <Route path="media" element={<MediaManagement />} />}
          <Route path="database" element={<DataManagement />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<NotificationManagement />} />
          <Route path="feedbacks" element={<FeedbackManagement />} />
        </Route>

        {/* 维护模式路由守卫 */}
        <Route element={<MaintenanceGuard />}>
          {/* 主页 */}
          <Route path="/index" element={<IndexPage />} />

          {/* 文章创建页 */}
          <Route path="/article/create" element={<ArticleCreate />} />
          <Route path="/article/edit/:id" element={<ArticleCreate />} />

          {/* 文章详情页 */}
          <Route path="/article/:id" element={<ArticleViewPage />} />

          {/* 作业列表页 */}
          <Route path="/assignments" element={<Navigate to="/personal?tab=assignments" replace />} />
          {/* 作业提交页 */}
          <Route path="/assignment/submit/:id" element={<AssignmentSubmit />} />
          {/* 作业提交详情页 */}
          <Route path="/assignment/submissions/:id" element={<AssignmentSubmissions />} />

          {/* 测试页面（仅开发环境可见） */}
          {import.meta.env.DEV && <Route path="/test/chunk-upload" element={<ChunkUploadTest />} />}
          {import.meta.env.DEV && <Route path="/test/theme-style-panel" element={<SampleThemeStylePanel />} />}

          {/* 用户组织列表页 */}
          <Route path="/organizations/list" element={<OrganizationList />} />
          {/* 组织详情页 */}
          <Route path="/organization/detail/:id" element={<OrganizationDetail />} />

          <Route
            path="/profile/:id"
            element={
              <AuthRequired>
                <Profile />
              </AuthRequired>
            }
          />

          {/* 个人管理中心 */}
          <Route path="/personal" element={<PersonalCenter />} />

          {/* 用户系统：帮助中心（仅开发环境可见） */}
          <Route path="/help" element={<HelpCenter />} />

          {/* 私信会话：页面正式开放，但必须登录后访问 */}
          <Route
            path="/messages"
            element={
              <AuthRequired title="登录后查看私信" message="私信会话仅对已登录用户开放。">
                <Messages />
              </AuthRequired>
            }
          />

          {SampleAgentSessionPanel && <Route path="/test/agent-session-panel" element={<SampleAgentSessionPanel />} />}

          {/* 研发平台 */}
          <Route path="/rd" element={<RdLayout />}>
            <Route index element={<RdDashboard />} />
            {AgentSessionPanel && (
              <Route
                path="agent"
                element={
                  <AuthRequired title="登录后使用 Agent" message="请先登录。">
                    <AgentSessionPanel />
                  </AuthRequired>
                }
              />
            )}

            <Route path="trends" element={<TrendAnalysis />} />
            <Route path="requirements" element={<RequirementList />} />
            <Route path="requirements/:id" element={<TicketDetail />} />
            <Route path="bugs" element={<BugList />} />
            <Route path="bugs/:id" element={<TicketDetail />} />
            <Route path="tasks" element={<TaskList />} />
            <Route path="tasks/:id" element={<TicketDetail />} />
            <Route path="reviews" element={<CodeReviewList />} />
            <Route path="my-tickets" element={<MyTickets />} />
          </Route>

          {/* 404 页面 */}
          <Route path="*" element={<NotFound404 />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default RouterConfig;

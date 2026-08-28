import React from "react";
import NotFound404 from "../pages/error/NotFound404";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "../pages/auth/AuthPage";
import MaintenanceGuard from "../components/maintenance/MaintenanceGuard";
import IndexPage from "../pages/home/IndexPage";
import ArticleCreate from "../pages/article/ArticleCreate";
import Profile from "../pages/profile/ProfilePage";
import AuthRequired from "../components/auth/AuthRequired";
import PersonalCenter from "../pages/personal/PersonalCenter";
import AdminLayout from "../pages/admin/AdminLayout";
import Dashboard from "../pages/admin/Dashboard";
import UserManagement from "../pages/admin/UserManagement";
import ArticleManagement from "../pages/admin/ArticleManagement";
import AssignmentManagement from "../pages/admin/AssignmentManagement";
import CategoryManagement from "../pages/admin/CategoryManagement";
import CommentManagement from "../pages/admin/CommentManagement";
import MediaManagement from "../pages/admin/MediaManagement";
import NotificationManagement from "../pages/admin/NotificationManagement";
import FeedbackManagement from "../pages/admin/FeedbackManagement";
import DataManagement from "../pages/admin/DataManagement";
import Settings from "../pages/admin/Settings";
import OrganizationManagement from "../pages/admin/OrganizationManagement";
import OrganizationList from "../pages/organization/OrganizationList";
import OrganizationDetail from "../pages/organization/OrganizationDetail";
import ArticleViewPage from "../pages/article/ArticleViewPage";
import AssignmentSubmit from "../pages/assignment/AssignmentSubmit";
import AssignmentSubmissions from "../pages/assignment/AssignmentSubmissions";
import ChunkUploadTest from "../pages/test/ChunkUploadTest";
import SampleThemeStylePanel from "../sample/ThemeStylePanel";
import SampleAgentSessionPanel from "../sample/AgentSessionPanel";
import RdLayout from "../pages/rd-platform/RdLayout";
import RdDashboard from "../pages/rd-platform/Dashboard";
import RequirementList from "../pages/rd-platform/RequirementList";
import BugList from "../pages/rd-platform/BugList";
import TaskList from "../pages/rd-platform/TaskList";
import MyTickets from "../pages/rd-platform/MyTickets";
import CodeReviewList from "../pages/rd-platform/CodeReviewList";
import TicketDetail from "../pages/rd-platform/TicketDetail";
import TrendAnalysis from "../pages/rd-platform/TrendAnalysis";
import HelpCenter from "../pages/user/HelpCenter";
import Messages from "../pages/user/Messages";

const RouterConfig: React.FC = () => {
  return (
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
        {import.meta.env.DEV && <Route path="/test/agent-session-panel" element={<SampleAgentSessionPanel />} />}

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

        {/* 私信会话（仅开发环境可见） */}
        {import.meta.env.DEV && <Route path="/messages" element={<Messages />} />}

        {/* 研发平台 */}
        <Route path="/rd" element={<RdLayout />}>
          <Route index element={<RdDashboard />} />
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
  );
};

export default RouterConfig;

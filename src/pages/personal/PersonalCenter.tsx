import React, { useState, useEffect, useCallback } from "react";
import {
  FaTag,
  FaFileAlt,
  FaChartBar,
  FaBars,
  FaTimes,
  FaUserLock,
  FaUsers,
  FaBell,
  FaUserCircle,
  FaUserEdit,
  FaUserPlus,
  FaShieldAlt,
  FaUserFriends,
  FaTasks,
  FaBookmark,
} from "react-icons/fa";
import { useNavigate, useSearchParams } from "react-router-dom";
import Loading from "@/components/loading/Loading";
import Skeleton from "@/components/skeleton/Skeleton";
import ThemeToggle from "@/components/themeToggle/ThemeToggle";
import Notification from "@/components/notification/Notification";
import UserDropdown from "@/components/userDropdown/UserDropdown";
import Footer from "@/components/footer/Footer";
import Avatar from "@/components/avatar/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import AuthService, { type UserStats } from "@/services/authService";
import styles from "./PersonalCenter.module.css";
import MyArticlesTab from "./components/MyArticlesTab";
import MyTagsTab from "./components/MyTagsTab";
import StatsTab from "./components/StatsTab";
import MyOrganizationsTab from "./components/MyOrganizationsTab";
import NotificationsTab from "./components/NotificationsTab";
import EditProfileTab from "./components/EditProfileTab";
import FollowingTab from "./components/FollowingTab";
import FollowerTab from "./components/FollowerTab";
import MyAssignmentsTab from "./components/MyAssignmentsTab";
import SecurityTab from "@/pages/user/SecurityTab";
import BookmarksTab from "@/pages/blog/BookmarksTab";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

type TabId =
  | "articles"
  | "assignments"
  | "tags"
  | "stats"
  | "organizations"
  | "notifications"
  | "edit"
  | "following"
  | "followers"
  | "security"
  | "bookmarks";

const TAB_IDS: TabId[] = [
  "articles",
  "assignments",
  "tags",
  "stats",
  "organizations",
  "notifications",
  "edit",
  "following",
  "followers",
  "security",
  "bookmarks",
];

const PersonalCenter: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get("tab");
    return TAB_IDS.includes(tab as TabId) ? (tab as TabId) : "articles";
  });
  const [loading] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await AuthService.getUserStats();
      setStats(data);
    } catch {
      // 静默处理
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated, fetchStats]);

  // 用户数据（从认证上下文获取，与导航栏保持一致）
  const currentUser = user
    ? {
        id: user.id,
        name: user.name || user.account || "用户",
        avatar: user.avatar || "https://picsum.photos/id/64/200", // 默认头像
        role: user.role || "用户",
        email: user.email,
      }
    : null;

  // 处理退出登录
  const handleLogout = () => {
    logout();
  };

  // 处理登录跳转
  const handleLoginRedirect = () => {
    navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
  };

  // 导航菜单配置
  const navItems: NavItem[] = [
    {
      id: "articles",
      label: "我的文章",
      icon: <FaFileAlt />,
      path: "/personal?tab=articles",
    },
    {
      id: "assignments",
      label: "我的任务",
      icon: <FaTasks />,
      path: "/personal?tab=assignments",
    },
    {
      id: "edit",
      label: "编辑资料",
      icon: <FaUserEdit />,
      path: "/personal?tab=edit",
    },
    { id: "tags", label: "我的标签", icon: <FaTag />, path: "/personal?tab=tags" },
    {
      id: "stats",
      label: "数据统计",
      icon: <FaChartBar />,
      path: "/personal?tab=stats",
    },
    {
      id: "organizations",
      label: "我的组织",
      icon: <FaUsers />,
      path: "/personal?tab=organizations",
    },
    {
      id: "following",
      label: "我的关注",
      icon: <FaUserPlus />,
      path: "/personal?tab=following",
    },
    {
      id: "followers",
      label: "我的粉丝",
      icon: <FaUserFriends />,
      path: "/personal?tab=followers",
    },
    {
      id: "notifications",
      label: "通知中心",
      icon: <FaBell />,
      path: "/personal?tab=notifications",
    },
    {
      id: "security",
      label: "账户安全",
      icon: <FaShieldAlt />,
      path: "/personal?tab=security",
    },
  ];

  // 以下为尚未完成的 mock 界面，仅开发环境可见
  if (import.meta.env.DEV) {
    navItems.push({
      id: "bookmarks",
      label: "我的收藏",
      icon: <FaBookmark />,
      path: "/personal?tab=bookmarks",
    });
  }

  // 从 URL 参数读取初始 tab（刷新保持当前tab）
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && navItems.some((item) => item.id === tab)) {
      setActiveTab(tab as typeof activeTab);
    }
  }, [searchParams]);

  // 清理tooltip
  useEffect(() => {
    return () => {
      const tooltip = document.getElementById("sidebar-tooltip");
      if (tooltip && tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    };
  }, []);

  // 如果正在验证身份，显示骨架屏
  if (authLoading) {
    return (
      <div className={styles.adminLayout}>
        <div className={styles.adminContainer}>
          {/* 侧边栏骨架 */}
          <aside className={styles.adminSidebar} style={{ width: "240px" }}>
            <div className={styles.adminSidebarHeader} style={{ padding: "20px" }}>
              <Skeleton variant="rectangular" width={120} height={32} />
            </div>
            <div style={{ padding: "20px 12px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ marginBottom: "24px" }}>
                  <Skeleton variant="rounded" height={40} />
                </div>
              ))}
            </div>
          </aside>

          {/* 主内容骨架 */}
          <main className={styles.adminMainContent} style={{ flex: 1 }}>
            {/* 顶部栏骨架 */}
            <header
              className={styles.adminTopBar}
              style={{
                padding: "0 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                height: "64px",
              }}
            >
              <Skeleton variant="text" width={100} height={24} />
              <div style={{ display: "flex", gap: "16px" }}>
                <Skeleton variant="circular" width={32} height={32} />
                <Skeleton variant="circular" width={32} height={32} />
              </div>
            </header>

            {/* 页面内容骨架 */}
            <div className={styles.adminPageContent} style={{ padding: "24px" }}>
              <div
                style={{
                  marginBottom: "24px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <Skeleton variant="text" width={150} height={32} />
                <Skeleton variant="rounded" width={100} height={36} />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <Skeleton variant="rounded" height={48} />
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={{ marginBottom: "12px" }}>
                    <Skeleton variant="rounded" height={80} />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // 如果用户未登录，显示提示
  if (!isAuthenticated || !currentUser) {
    return (
      <div
        className={styles.pageContainer}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "80vh",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
            backgroundColor: "var(--card-bg)",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
            maxWidth: "400px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              color: "var(--primary)",
              marginBottom: "24px",
              opacity: 0.8,
            }}
          >
            <FaUserLock />
          </div>
          <h2
            style={{
              marginBottom: "12px",
              color: "var(--text-primary)",
              fontSize: "24px",
              fontWeight: "600",
            }}
          >
            请先登录
          </h2>
          <p
            style={{
              marginBottom: "32px",
              color: "var(--text-secondary)",
              fontSize: "15px",
              lineHeight: "1.6",
            }}
          >
            您需要登录后才能访问个人中心，查看和管理您的文章、标签及数据统计。
          </p>
          <button
            onClick={handleLoginRedirect}
            style={{
              padding: "12px 32px",
              backgroundColor: "var(--primary)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "500",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(var(--primary-rgb), 0.3)",
              width: "100%",
            }}
          >
            立即登录
          </button>
          <button
            onClick={() => navigate("/")}
            style={{
              marginTop: "16px",
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // 切换侧边栏
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // 切换移动端菜单
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // 关闭移动端菜单
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  // 显示工具提示
  const showTooltip = (event: React.MouseEvent, text: string) => {
    if (sidebarCollapsed) {
      // 创建或显示tooltip
      let tooltip = document.getElementById("sidebar-tooltip");
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "sidebar-tooltip";
        tooltip.style.cssText = `
                    position: fixed;
                    padding: 6px 12px;
                    background-color: var(--card-bg);
                    border: 1px solid var(--border-primary);
                    border-radius: 6px;
                    color: var(--text-primary);
                    font-size: 12px;
                    white-space: nowrap;
                    z-index: 10000;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    pointer-events: none;
                    opacity: 0;
                `;
        document.body.appendChild(tooltip);
      }

      tooltip.textContent = text;
      const rect = event.currentTarget.getBoundingClientRect();
      tooltip.style.left = `${rect.right + 8}px`;
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.style.transform = "translateY(-50%)";

      // 显示tooltip
      setTimeout(() => {
        if (tooltip) tooltip.style.opacity = "1";
      }, 10);
    }
  };

  // 隐藏工具提示
  const hideTooltip = () => {
    const tooltip = document.getElementById("sidebar-tooltip");
    if (tooltip) {
      tooltip.style.opacity = "0";
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      }, 300);
    }
  };

  // 编辑标签

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Loading size="large" text="正在加载个人数据..." />
      </div>
    );
  }

  return (
    <div className={styles.adminLayout}>
      {/* 移动端菜单遮罩 */}
      <div className={`${styles.mobileMenuOverlay} ${mobileMenuOpen ? styles.show : ""}`} onClick={closeMobileMenu} />

      <div className={styles.adminContainer}>
        {/* 侧边栏 */}
        <aside
          className={`${styles.adminSidebar} ${sidebarCollapsed ? styles.collapsed : ""} ${mobileMenuOpen ? styles.mobileOpen : ""}`}
        >
          {/* Logo区域 */}
          <div className={styles.adminSidebarHeader}>
            <div onClick={() => navigate("/personal")} className={styles.adminLogo}>
              <span className={styles.adminLogoIcon}>
                <FaUserCircle />
              </span>
              <span className={styles.adminLogoText}>个人中心</span>
            </div>
            <button className={styles.toggleSidebarBtn} onClick={toggleSidebar} title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}>
              {sidebarCollapsed ? <FaBars /> : <FaTimes />}
            </button>
          </div>

          {/* 导航菜单 */}
          <nav className={styles.adminNavMenu}>
            {navItems.map((item) => (
              <div key={item.id} className={styles.adminNavItem}>
                <button
                  className={`${styles.adminNavLink} ${activeTab === item.id ? styles.active : ""}`}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    closeMobileMenu();
                    navigate(item.path, { replace: true });
                  }}
                  onMouseEnter={(e) => showTooltip(e, item.label)}
                  onMouseLeave={hideTooltip}
                >
                  <span className={styles.adminNavIcon}>{item.icon}</span>
                  <span className={styles.adminNavText}>{item.label}</span>
                </button>
              </div>
            ))}
          </nav>
        </aside>

        {/* 主内容区域 */}
        <main className={`${styles.adminMainContent} ${sidebarCollapsed ? styles.expanded : ""}`}>
          {/* 顶部栏 */}
          <header className={styles.adminTopBar}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* 移动端菜单按钮 */}
              <button className={styles.mobileMenuBtn} onClick={toggleMobileMenu} aria-label="打开菜单">
                <FaBars />
              </button>

              {/* 面包屑导航 */}
              <nav className={styles.adminBreadcrumb}>
                <span className={styles.breadcrumbActive}>{navItems.find((item) => item.id === activeTab)?.label || "个人中心"}</span>
              </nav>
            </div>

            {/* 顶部操作区域 */}
            <div className={styles.adminTopBarActions}>
              <ThemeToggle />
              <Notification />

              {/* 用户信息区域 */}
              <UserDropdown user={currentUser} onLogout={handleLogout} showAdminLink={currentUser?.role === "管理员"} />
            </div>
          </header>

          {/* 页面内容 */}
          <div className={styles.adminPageContent}>
            {/* 用户信息概览卡片 */}
            <div className={styles.profileCard}>
              <Avatar src={currentUser.avatar} name={currentUser.name} size={80} className={styles.profileAvatar} />
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>
                  {currentUser.name}
                  <span className={styles.profileRoleTag}>{currentUser.role}</span>
                </div>
                <div className={styles.profileMeta}>
                  <span className={styles.profileEmail}>{currentUser.email}</span>
                  <button className={styles.profileEditBtn} onClick={() => setActiveTab("edit")}>
                    <FaUserEdit />
                    编辑资料
                  </button>
                </div>
              </div>
              <div className={styles.profileStats}>
                <div className={styles.profileStatItem} onClick={() => setActiveTab("articles")}>
                  <div className={styles.profileStatValue}>{stats?.total_articles ?? "-"}</div>
                  <div className={styles.profileStatLabel}>文章</div>
                </div>
                <div className={styles.profileStatItem} onClick={() => setActiveTab("following")}>
                  <div className={styles.profileStatValue}>{user?.following_count ?? 0}</div>
                  <div className={styles.profileStatLabel}>关注</div>
                </div>
                <div className={styles.profileStatItem} onClick={() => setActiveTab("followers")}>
                  <div className={styles.profileStatValue}>{user?.follower_count ?? 0}</div>
                  <div className={styles.profileStatLabel}>粉丝</div>
                </div>
                <div className={styles.profileStatItem} onClick={() => setActiveTab("tags")}>
                  <div className={styles.profileStatValue}>{stats?.total_tags ?? "-"}</div>
                  <div className={styles.profileStatLabel}>标签</div>
                </div>
                <div className={styles.profileStatItem} onClick={() => setActiveTab("organizations")}>
                  <div className={styles.profileStatValue}>{stats?.total_organizations ?? "-"}</div>
                  <div className={styles.profileStatLabel}>组织</div>
                </div>
              </div>
            </div>

            {/* 文章管理 */}
            {activeTab === "articles" && <MyArticlesTab />}

            {/* 我的任务 */}
            {activeTab === "assignments" && <MyAssignmentsTab />}

            {/* 标签管理 */}
            {activeTab === "tags" && <MyTagsTab />}

            {/* 数据统计 */}
            {activeTab === "stats" && stats && <StatsTab stats={stats} />}

            {/* 我的组织 */}
            {activeTab === "organizations" && <MyOrganizationsTab />}

            {/* 我的关注 */}
            {activeTab === "following" && <FollowingTab />}

            {/* 我的粉丝 */}
            {activeTab === "followers" && <FollowerTab />}

            {/* 通知中心 */}
            {activeTab === "notifications" && <NotificationsTab />}

            {/* 编辑资料 */}
            {activeTab === "edit" && <EditProfileTab />}

            {/* 账户安全 */}
            {activeTab === "security" && <SecurityTab />}

            {/* 我的收藏 */}
            {activeTab === "bookmarks" && <BookmarksTab />}
          </div>

          {/* Footer */}
          <Footer startYear={2025} />
        </main>
      </div>
    </div>
  );
};

export default PersonalCenter;

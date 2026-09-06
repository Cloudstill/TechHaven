import React, { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AuthService } from "../services/authService";
import { tokenManager, getTokenFromCookie, getCookie, clearAuthCookies, setUnauthorizedHandler } from "../utils/http";
import { notificationWS, chatWS } from "../utils/websocket";
import { setFaviconBadge } from "../utils/favicon";
import { resetNotificationState } from "../utils/notificationState";
import { connectPresence } from "../services/presenceService";

// 用户信息类型
export interface User {
  id: number | string;
  account: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  website?: string;
  github?: string;
  role: string;
  login_time: number | string;
  status: number | string;
  following_count?: number;
  follower_count?: number;
}

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (authId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  loginError: string | null;
  clearLoginError: () => void;
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 状态映射
const ROLE_MAP: Record<string, string> = {
  1: "用户",
  2: "管理员",
  3: "编辑",
  4: "审核员",
};

// 认证提供者组件
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const navigate = useNavigate();

  const extractToken = (response: any): string | null => {
    const candidates = [
      response?.token,
      response?.access_token,
      response?.data?.token,
      response?.data?.access_token,
      response?.data?.data?.token,
      response?.data?.data?.access_token,
      response?.data?.data?.data?.token,
      response?.data?.data?.data?.access_token,
    ];

    for (const t of candidates) {
      if (typeof t === "string" && t.trim()) return t;
    }
    return null;
  };

  const clearAuthRuntimeState = useCallback(() => {
    setUser(null);
    setToken(null);
    tokenManager.clearToken();
    clearAuthCookies();
    resetNotificationState();
    setFaviconBadge(0);
  }, []);

  // HTTP 1101 与 AuthContext 同步，避免 token 已清但界面仍显示已登录。
  useEffect(() => {
    setUnauthorizedHandler(clearAuthRuntimeState);
    return () => setUnauthorizedHandler(null);
  }, [clearAuthRuntimeState]);

  // 初始化认证状态
  useEffect(() => {
    const initAuth = async () => {
      try {
        const cookieToken = getTokenFromCookie();

        if (cookieToken) {
          setToken(cookieToken);
          tokenManager.setToken(cookieToken);
        }

        try {
          const userResponse = await AuthService.getUserInfo();

          if (userResponse.data && userResponse.errno === 0) {
            const userData = userResponse.data;
            userData.role = ROLE_MAP[userData.role] || "用户";
            setUser(userData);
          } else {
            clearAuthRuntimeState();
          }
        } catch (_userError) {
          clearAuthRuntimeState();
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // 会话失效（token 过期 / 被顶下线）→ 清除登录态并跳转登录页
  useEffect(() => {
    const handleSessionInvalidated = () => {
      clearAuthRuntimeState();
      if (!window.location.pathname.startsWith("/auth")) {
        navigate("/auth");
      }
    };
    tokenManager.addSessionInvalidatedListener(handleSessionInvalidated);
    return () => {
      tokenManager.removeSessionInvalidatedListener(handleSessionInvalidated);
    };
  }, [clearAuthRuntimeState, navigate]);

  // 计算是否已认证（必须在 WebSocket useEffect 之前声明）
  const isAuthenticated = !!user;

  // WebSocket 连接管理 — 在 AuthProvider 层持久化，不会随路由切换重连
  useEffect(() => {
    if (isAuthenticated && user) {
      notificationWS.connect(user.id);
      // 普通用户无私信权限，不建立聊天连接（后端同样拒绝，避免重连循环）
      if (!["用户", "1"].includes(String(user.role))) {
        chatWS.connect(user.id);
      } else {
        chatWS.disconnect();
      }
    } else {
      notificationWS.disconnect();
      chatWS.disconnect();
      setFaviconBadge(0); // 退出登录或未认证时清除 favicon 角标
    }
  }, [isAuthenticated, user]);

  // 跟踪当前 token，供 WS 鉴权错误处理时比对 Cookie 中是否为新 token
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // WS 鉴权失败（token 过期 / 不匹配 / 账号异常）时刷新 token 并重连
  const wsAuthRetry = useRef(0);
  const WS_AUTH_MAX_RETRY = 2;
  useEffect(() => {
    const unsubOpen = notificationWS.onOpen(() => {
      wsAuthRetry.current = 0;
    });
    // 聊天 WS 失败（如无权限/账号异常）绝不影响登录态，仅停止重连避免循环。
    // 会话失效由 notificationWS 统一处理。
    const unsubChatError = chatWS.onServerError(async () => {
      chatWS.disconnect();
    });
    const unsubError = notificationWS.onServerError(async (err) => {
      // 账号状态异常（1103），刷新 token 无意义，直接登出
      if (err.errno === 1103) {
        clearAuthRuntimeState();
        return;
      }
      // 仅处理 token 相关鉴权错误（1101：过期 / 不匹配）
      if (err.errno !== 1101) return;

      // 无用户上下文或已达到最大重试次数，放弃并清理登录态
      if (!user?.id || wsAuthRetry.current >= WS_AUTH_MAX_RETRY) {
        clearAuthRuntimeState();
        return;
      }
      wsAuthRetry.current += 1;

      // 调用 refresh_token 无感续期，服务端会写入新 cookie
      try {
        const res = await AuthService.refreshToken(user.id);
        if (res.errno === 0 && res.data?.token) {
          const newToken = res.data.token;
          tokenRef.current = newToken;
          setToken(newToken);
          tokenManager.setToken(newToken);
          wsAuthRetry.current = 0;
          // 重连：connect 会重新读取（已被服务端刷新的）S_TOKEN / S_TOKEN_TIME cookie
          notificationWS.connect(user.id);
          if (!["用户", "1"].includes(String(user.role))) {
            chatWS.connect(user.id);
          }
        } else {
          clearAuthRuntimeState();
        }
      } catch {
        clearAuthRuntimeState();
      }
    });
    return () => {
      unsubOpen();
      unsubError();
      unsubChatError();
    };
  }, [user]);

  // Token 主动续期：S_TOKEN_TIME 快过期前刷新 token，成功后回写并重连 WS
  const refreshingRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const doRefresh = async () => {
      if (disposed || refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const res = await AuthService.refreshToken(user.id);
        if (res.errno === 0 && res.data?.token) {
          const newToken = res.data.token;
          tokenRef.current = newToken;
          setToken(newToken);
          tokenManager.setToken(newToken);
          // 重连：connect 会重新读取（已被服务端刷新的）S_TOKEN / S_TOKEN_TIME cookie
          notificationWS.connect(user.id);
          if (!["用户", "1"].includes(String(user.role))) {
            chatWS.connect(user.id);
          }
          connectPresence(user.id);
        }
      } catch {
        // 网络异常等：交由 1101 会话失效或下一轮调度处理
      } finally {
        refreshingRef.current = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const tokenTimeStr = getCookie("S_TOKEN_TIME");
      if (!tokenTimeStr) return;
      const ts = Number(tokenTimeStr);
      if (!Number.isFinite(ts) || ts <= 0) return;
      const tokenTimeMs = ts > 1e12 ? ts : ts * 1000;
      const remaining = tokenTimeMs - Date.now();
      if (remaining <= 0) return; // 已过期，交由 1101 处理
      // 提前 60s 刷新（下限 30s），避免短 token 高频请求
      const delay = Math.max(remaining - 60 * 1000, 30 * 1000);
      timer = setTimeout(doRefresh, delay);
    };

    schedule();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, user, token, connectPresence]);

  // 登录方法
  const login = async (authId: string, password: string) => {
    return loginWithRetry(authId, password, false);
  };

  const loginWithRetry = async (authId: string, password: string, retried: boolean) => {
    try {
      setLoginError(null);
      setLoading(true);
      resetNotificationState();
      setFaviconBadge(0);

      const response = await AuthService.login(authId, password);

      if (response.errno === 0) {
        let userToken = extractToken(response);

        if (!userToken) userToken = getTokenFromCookie();

        if (userToken) {
          setToken(userToken);
          tokenManager.setToken(userToken);
          // console.log('✅ Token已设置:', userToken);
        } else {
          // console.warn('⚠️ 未找到token，检查响应headers和Cookie:', (response as any).headers);
          // console.log('🍪 当前页面Cookie:', document.cookie);
        }

        // 获取最新的用户信息
        try {
          const userResponse = await AuthService.getUserInfo();

          if (userResponse.data && userResponse.errno === 0) {
            const updatedUser = userResponse.data;
            updatedUser.role = ROLE_MAP[updatedUser.role] || "用户";
            setUser(updatedUser);
          } else {
            console.warn("⚠️ 用户信息接口返回异常:", userResponse);
          }
        } catch (_userError) {
          // console.warn('⚠️ 获取最新用户信息失败，使用登录返回的用户信息:', userError);
          // 如果获取用户信息失败，使用登录响应中的用户信息
          if ((response.data as any)?.user) {
            const fallbackUserData = (response.data as any).user;
            // 转换为User类型
            const fallbackUser: User = {
              ...fallbackUserData,
              account: fallbackUserData.username || fallbackUserData.account || "",
              login_time: fallbackUserData.login_time || new Date().toISOString(),
              status: fallbackUserData.status || "active",
            };
            setUser(fallbackUser);
            // console.log('🔄 使用登录响应的用户信息:', fallbackUser);
            // console.log('🔐 当前认证状态:', { token: userToken, user: fallbackUser });
          }
        }
      } else {
        console.warn("⚠️ 登录响应状态异常:", response);
      }
    } catch (error: any) {
      // 2010 USER_ALREADY_LOGIN：本设备已有登录态，先登出再重试一次登录
      if (!retried && error?.errno === 2010) {
        try {
          await AuthService.logout();
        } catch {
          // 登出失败不阻断重试
        }
        clearAuthRuntimeState();
        return loginWithRetry(authId, password, true);
      }
      setLoginError(error.message || "登录失败");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // 登出方法
  const logout = async () => {
    try {
      setLoading(true);
      // 调用后端登出接口
      await AuthService.logout();
      // 清除内存状态
      clearAuthRuntimeState();
      setLoginError(null);
    } catch (error) {
      console.error("登出失败:", error);
      // 即使后端登出失败，也清除本地状态
      clearAuthRuntimeState();
    } finally {
      setLoading(false);
    }
  };

  // 清除登录错误
  const clearLoginError = () => {
    setLoginError(null);
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    isAuthenticated,
    loading,
    loginError,
    clearLoginError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 自定义hook：使用认证上下文
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth必须在AuthProvider内部使用");
  }
  return context;
};

export default AuthContext;

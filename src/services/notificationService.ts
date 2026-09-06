import http from "../utils/http";
import type { NotificationListResponse } from "../types/notification";

export class NotificationService {
  /**
   * 获取通知列表
   */
  static async getNotifications(params?: { offset?: number; size?: number; type?: string }): Promise<NotificationListResponse> {
    const response = await http.get<NotificationListResponse>("/notification/list", {
      params: {
        offset: params?.offset ?? 0,
        size: params?.size ?? 20,
        ...(params?.type && params.type !== "all" ? { type: params.type } : {}),
      },
    });
    return response.data;
  }

  /**
   * 获取未读通知数量
   */
  static async getUnreadCount(): Promise<{ count: number }> {
    const response = await http.get<{ count: number }>("/notification/unread_count");
    return response.data;
  }

  /**
   * 标记通知为已读（支持单条或批量）
   */
  static async markAsRead(notificationId: number | string): Promise<void> {
    await http.post("/notification/read", null, {
      params: { id: notificationId },
    });
  }

  /**
   * 批量标记通知为已读
   */
  static async markMultipleAsRead(ids: (number | string)[]): Promise<void> {
    await http.post("/notification/read", null, {
      params: { ids: ids.join(",") },
    });
  }

  /**
   * 标记所有通知为已读
   */
  static async markAllAsRead(): Promise<void> {
    await http.post("/notification/read_all");
  }

  /**
   * 管理员发送通知
   */
  static async sendNotification(params: {
    title: string;
    content: string;
    type: string;
    target: "all" | "users";
    user_ids?: string;
    is_broadcast?: boolean;
    level?: string;
    start_time?: number;
    end_time?: number;
  }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("title", params.title);
    formData.append("content", params.content);
    formData.append("type", params.type);
    formData.append("target", params.target);
    if (params.user_ids) formData.append("user_ids", params.user_ids);
    if (params.is_broadcast) formData.append("is_broadcast", "1");
    if (params.level) formData.append("level", params.level);
    if (params.start_time !== undefined) formData.append("start_time", String(params.start_time));
    if (params.end_time !== undefined) formData.append("end_time", String(params.end_time));
    await http.postForm("/notification/send", formData);
  }

  /**
   * 获取广播跑马灯列表
   */
  static async getBroadcasts(): Promise<{ id: number; title: string; content: string; level: string }[]> {
    const response = await http.get<{ list: { id: number; title: string; content: string; level: string }[] }>("/broadcast/list");
    return response.data?.list ?? [];
  }

  /**
   * 关闭广播（手动下线）
   */
  static async closeBroadcast(id: number): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("id", String(id));
    await http.postForm("/broadcast/close", formData);
  }
}

export default NotificationService;

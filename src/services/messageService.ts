import http from "../utils/http";
import type { ChatMsg, Conversation, ConversationListResponse, MessageListResponse } from "../types/message";

/**
 * 私信服务
 */
export class MessageService {
  /**
   * 获取会话列表
   */
  static async getConversations(): Promise<ConversationListResponse> {
    const response = await http.get<ConversationListResponse>("/messages/conversations");
    return response.data;
  }

  /**
   * 获取单个会话的消息记录
   */
  static async getMessages(
    conversationId: number | string,
    params?: { offset?: number; size?: number },
  ): Promise<MessageListResponse> {
    const response = await http.get<MessageListResponse>(`/messages/conversations/${conversationId}`, {
      params: { offset: params?.offset ?? 0, size: params?.size ?? 50 },
    });
    return response.data;
  }

  /**
   * 发送一条消息
   */
  static async send(conversationId: number | string, text: string): Promise<ChatMsg> {
    const response = await http.postForm<ChatMsg>(`/messages/conversations/${conversationId}`, { text: text });
    return response.data;
  }

  /**
   * 将某会话标记为已读
   */
  static async markRead(conversationId: number | string): Promise<{ unread: number }> {
    const response = await http.post<{ unread: number }>(`/messages/conversations/${conversationId}/read`);
    return response.data;
  }

  /**
   * 在本端删除/隐藏会话（对端与消息不受影响）
   */
  static async deleteConversation(conversationId: number | string): Promise<{ deleted: boolean }> {
    const response = await http.post<{ deleted: boolean }>(`/messages/conversations/${conversationId}/delete`);
    return response.data;
  }

  /**
   * 发起/获取与某用户的会话（已存在则返回原会话）
   */
  static async createConversation(peerId: number | string): Promise<Conversation> {
    const response = await http.postForm<Conversation>("/messages/conversations", { peer_id: peerId });
    return response.data;
  }
}

export default MessageService;

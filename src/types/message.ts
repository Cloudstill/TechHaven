/**
 * 私信消息类型定义
 */

export interface ChatMsg {
  /** 消息 ID */
  id: number | string;
  /** 是否为当前用户发送 */
  fromMe: boolean;
  /** 消息内容 */
  text: string;
  /** 消息时间（Unix 秒） */
  create_time: number;
}

export interface Conversation {
  /** 会话 ID */
  id: number | string;
  /** 对端用户 ID */
  peer_id: number | string;
  /** 对端用户昵称 */
  name: string;
  /** 对端是否在线 */
  online: boolean;
  /** 最近消息时间（Unix 秒） */
  last_time: number;
  /** 未读条数 */
  unread: number;
  /** 最近一条消息 */
  messages: ChatMsg[];
}

export interface ConversationListResponse {
  list: Conversation[];
}

export interface MessageListResponse {
  list: ChatMsg[];
}

/** WebSocket 推送的新消息帧（type="message"） */
export interface MessagePushFrame {
  type: "message";
  conversation_id: number;
  message: ChatMsg;
}

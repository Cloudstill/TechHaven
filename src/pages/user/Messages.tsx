import React, { useState, useRef, useEffect, useCallback } from "react";
import { FaSearch, FaPaperPlane, FaCircle, FaRegSmile, FaArrowLeft, FaPlus, FaTrash } from "react-icons/fa";
import styles from "./UserPage.module.css";
import msgStyles from "./Messages.module.css";
import Navbar from "@/components/navbar/Navbar";
import Footer from "@/components/footer/Footer";
import Avatar from "@/components/avatar/Avatar";
import Input from "@/components/input/Input";
import MessageService from "@/services/messageService";
import FollowService from "@/services/followService";
import { chatWS } from "@/utils/websocket";
import { confirm } from "@/components/confirm/Confirm";
import { useAuth } from "@/contexts/AuthContext";
import type { ChatMsg, Conversation } from "@/types/message";
import type { MutualFollowUser } from "@/types/follow";

/** 将 Unix 时间戳格式化为展示时间（今天 HH:MM / 昨天 HH:MM / 日期） */
const formatMsgTime = (ts: number): string => {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const now = new Date();
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (date.toDateString() === now.toDateString()) {
    return hhmm;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${hhmm}`;
  }
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return date.getFullYear() === now.getFullYear() ? `${mmdd} ${hhmm}` : `${date.getFullYear()}-${mmdd} ${hhmm}`;
};

const Messages: React.FC = () => {
  const { user } = useAuth();
  // 普通用户无权限使用私信（兼容 role 为中文名或数字；后端同样校验）
  const denied = !user || ["用户", "1"].includes(String(user.role));

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [peerSearch, setPeerSearch] = useState("");
  const [mutualUsers, setMutualUsers] = useState<MutualFollowUser[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [startingPeerId, setStartingPeerId] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string>("");
  const peerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((c) => String(c.id) === activeId) || conversations[0];

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // 加载会话列表
  useEffect(() => {
    if (denied) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await MessageService.getConversations();
        if (cancelled) return;
        const list = data.list ?? [];
        setConversations(list);
        if (!activeIdRef.current && list.length > 0) {
          setActiveId(String(list[0].id));
        }
      } catch {
        // 静默处理
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [denied]);

  // 切换会话时加载消息记录
  useEffect(() => {
    if (denied || !activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await MessageService.getMessages(activeId);
        if (!cancelled) setMessages(data.list ?? []);
      } catch {
        // 静默处理
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // 消息变化时滚动到底部
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages.length, activeId]);

  // 标记会话已读：优先走 WS（可推送已读回执），未连接时退回 HTTP
  const sendRead = useCallback((convId: string) => {
    setConversations((prev) => prev.map((c) => (String(c.id) === convId ? { ...c, unread: 0 } : c)));
    if (chatWS.isConnected) {
      chatWS.send({ type: "read", conversation_id: Number(convId) });
    } else {
      MessageService.markRead(convId).catch(() => {});
    }
  }, []);

  // 聊天 WebSocket：接收新消息 + 发送确认 + 发送失败回滚
  useEffect(() => {
    if (denied) return;
    const unsubMsg = chatWS.onMessage("message", (data: any) => {
      const convId = String(data?.conversation_id ?? "");
      const msg = data?.message as ChatMsg | undefined;
      if (!convId || !msg) return;

      const isActive = convId === activeIdRef.current;

      // 更新会话列表：预览 + 未读角标
      setConversations((prev) => {
        const exists = prev.some((c) => String(c.id) === convId);
        if (!exists) {
          // 新会话（不在当前列表），重新拉取会话列表
          MessageService.getConversations()
            .then((d) => setConversations(d.list ?? []))
            .catch(() => {});
          return prev;
        }
        return prev.map((c) =>
          String(c.id) === convId
            ? {
                ...c,
                last_time: msg.create_time,
                messages: [msg],
                unread: isActive ? c.unread : c.unread + (msg.fromMe ? 0 : 1),
              }
            : c,
        );
      });

      // 当前打开的会话：追加消息并标记已读
      if (isActive) {
        setMessages((prev) => [...prev, msg]);
        sendRead(convId);
      }
    });

    const unsubAck = chatWS.onMessage("message_ack", (data: any) => {
      const convId = String(data?.conversation_id ?? "");
      const clientId = String(data?.client_id ?? "");
      const saved = data?.message as ChatMsg | undefined;
      if (!convId || !clientId || !saved) return;
      // 用服务端消息对齐乐观消息（服务端 id 与 create_time）
      setMessages((prev) => prev.map((m) => (String(m.id) === clientId ? saved : m)));
      setConversations((prev) =>
        prev.map((c) => (String(c.id) === convId ? { ...c, last_time: saved.create_time, messages: [saved] } : c)),
      );
    });

    const unsubErr = chatWS.onMessage("send_error", (data: any) => {
      const clientId = String(data?.client_id ?? "");
      if (!clientId) return;
      // 发送失败：移除对应乐观消息
      setMessages((prev) => prev.filter((m) => String(m.id) !== clientId));
    });

    return () => {
      unsubMsg();
      unsubAck();
      unsubErr();
    };
  }, [denied]);

  // 拉取互相关注用户（发起会话）
  const fetchMutual = useCallback(async (keyword: string) => {
    setPeerLoading(true);
    try {
      const data = await FollowService.getMutualFollowingList({ keyword, size: 30 });
      setMutualUsers(data.list ?? []);
    } catch {
      setMutualUsers([]);
    } finally {
      setPeerLoading(false);
    }
  }, []);

  const openNewChat = useCallback(() => {
    setNewChatOpen(true);
    setPeerSearch("");
    setMutualUsers([]);
    fetchMutual("");
  }, [fetchMutual]);

  // 搜索输入防抖
  useEffect(() => {
    if (!newChatOpen) return;
    if (peerSearchTimerRef.current) {
      clearTimeout(peerSearchTimerRef.current);
    }
    peerSearchTimerRef.current = setTimeout(() => {
      fetchMutual(peerSearch.trim());
    }, 300);
    return () => {
      if (peerSearchTimerRef.current) {
        clearTimeout(peerSearchTimerRef.current);
      }
    };
  }, [peerSearch, newChatOpen, fetchMutual]);

  const startChat = useCallback(
    async (peer: MutualFollowUser) => {
      setStartingPeerId(peer.id);
      try {
        const conv = await MessageService.createConversation(peer.id);
        setNewChatOpen(false);
        setConversations((prev) => {
          const exists = prev.some((c) => String(c.id) === String(conv.id));
          return exists ? prev : [conv, ...prev];
        });
        setMessages([]);
        setActiveId(String(conv.id));
        setMobileChatOpen(true);
        sendRead(String(conv.id));
      } catch {
        // 静默处理
      } finally {
        setStartingPeerId(null);
      }
    },
    [sendRead],
  );

  const selectConv = useCallback(
    (id: string) => {
      setActiveId(id);
      setMobileChatOpen(true);
      sendRead(id);
    },
    [sendRead],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !active) return;
    const now = Math.floor(Date.now() / 1000);
    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tempMsg: ChatMsg = { id: clientId, fromMe: true, text, create_time: now };
    const convId = String(active.id);

    // 乐观更新
    setMessages((prev) => [...prev, tempMsg]);
    setConversations((prev) => prev.map((c) => (String(c.id) === convId ? { ...c, last_time: now, messages: [tempMsg] } : c)));
    setInput("");

    if (chatWS.isConnected) {
      // 标准路径：经聊天 WS 发送，message_ack / send_error 事件负责对齐与回滚
      chatWS.send({ type: "send", client_id: clientId, conversation_id: Number(active.id), text });
      return;
    }

    // WS 未连接时退回 HTTP，用服务端结果直接对齐
    try {
      const saved = await MessageService.send(active.id, text);
      setMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? saved : m)));
      setConversations((prev) =>
        prev.map((c) => (String(c.id) === convId ? { ...c, last_time: saved.create_time, messages: [saved] } : c)),
      );
    } catch {
      // 发送失败：移除临时消息，内容回填输入框
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(text);
    }
  }, [input, active]);

  const filtered = conversations.filter((c) => !search || c.name.includes(search));

  const handleDelete = useCallback(
    async (convId: string) => {
      const target = conversations.find((c) => String(c.id) === convId);
      if (!target) return;
      const ok = await confirm({
        title: "删除会话",
        content: `确定删除与「${target.name}」的会话吗？删除后对方仍可看到，对方再发消息时该会话会重新出现。`,
        confirmText: "删除",
        cancelText: "取消",
      });
      if (!ok) return;
      try {
        await MessageService.deleteConversation(convId);
        const remaining = conversations.filter((c) => String(c.id) !== convId);
        setConversations(remaining);
        if (activeIdRef.current === convId) {
          const next = remaining[0];
          setMessages([]);
          if (next) {
            setActiveId(String(next.id));
            setMobileChatOpen(true);
          } else {
            setActiveId("");
            setMobileChatOpen(false);
          }
        }
      } catch {
        // 静默处理
      }
    },
    [conversations],
  );

  if (denied) {
    return (
      <div className={`${styles.page} ${msgStyles.msgPage}`}>
        <Navbar />
        <div className={msgStyles.wrapper}>
          <div className={msgStyles.convEmpty} style={{ margin: "auto" }}>
            私信功能仅对内部成员开放
          </div>
        </div>
        <Footer startYear={2025} />
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${msgStyles.msgPage}`}>
      <Navbar />
      <div className={msgStyles.wrapper}>
        <div className={`${msgStyles.chatLayout} ${mobileChatOpen ? msgStyles.showChat : ""}`}>
          <aside className={msgStyles.convList}>
            <div className={msgStyles.convSearch}>
              <Input placeholder="搜索会话" value={search} onChange={setSearch} prefix={<FaSearch />} allowClear />
              <button className={msgStyles.newChatBtn} onClick={openNewChat}>
                <FaPlus /> 发起会话
              </button>
            </div>
            <div className={msgStyles.convItems}>
              {loading ? (
                <div className={msgStyles.convEmpty}>加载中...</div>
              ) : filtered.length === 0 ? (
                <div className={msgStyles.convEmpty}>暂无会话</div>
              ) : (
                filtered.map((c) => (
                  <div
                    key={c.id}
                    className={`${msgStyles.convItem} ${String(active?.id) === String(c.id) ? msgStyles.convActive : ""}`}
                    onClick={() => selectConv(String(c.id))}
                  >
                    <div className={msgStyles.convAvatar}>
                      <Avatar name={c.name} size={44} />
                      {c.online && <FaCircle className={msgStyles.onlineDot} />}
                    </div>
                    <div className={msgStyles.convInfo}>
                      <div className={msgStyles.convTop}>
                        <span className={msgStyles.convName}>{c.name}</span>
                        <span className={msgStyles.convTime}>{formatMsgTime(c.last_time)}</span>
                      </div>
                      <div className={msgStyles.convBottom}>
                        <span className={msgStyles.convPreview}>{c.messages[c.messages.length - 1]?.text}</span>
                        {c.unread > 0 && <span className={msgStyles.convUnread}>{c.unread}</span>}
                      </div>
                    </div>
                    <button
                      className={msgStyles.convDelete}
                      title="删除会话"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(String(c.id));
                      }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className={msgStyles.chatWindow}>
            {active ? (
              <>
                <header className={msgStyles.chatHeader}>
                  <button className={msgStyles.backBtn} onClick={() => setMobileChatOpen(false)}>
                    <FaArrowLeft />
                  </button>
                  <Avatar name={active.name} size={36} />
                  <div>
                    <div className={msgStyles.chatName}>{active.name}</div>
                    <div className={msgStyles.chatStatus}>{active.online ? "在线" : "离线"}</div>
                  </div>
                </header>

                <div className={msgStyles.chatBody} ref={bodyRef}>
                  {messages.length === 0 ? (
                    <div className={msgStyles.convEmpty}>暂无消息，打个招呼吧</div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`${msgStyles.msgRow} ${m.fromMe ? msgStyles.msgMine : ""}`}>
                        {!m.fromMe && <Avatar name={active.name} size={32} />}
                        <div className={msgStyles.bubbleWrap}>
                          <div className={`${msgStyles.bubble} ${m.fromMe ? msgStyles.bubbleMine : ""}`}>{m.text}</div>
                          <span className={msgStyles.bubbleTime}>{formatMsgTime(m.create_time)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <footer className={msgStyles.chatInput}>
                  <button className={msgStyles.emojiBtn} title="表情">
                    <FaRegSmile />
                  </button>
                  <input
                    className={msgStyles.textInput}
                    placeholder="输入消息，回车发送"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button className={msgStyles.sendBtn} onClick={send} disabled={!input.trim()}>
                    <FaPaperPlane />
                  </button>
                </footer>
              </>
            ) : (
              <div className={msgStyles.chatEmpty}>请选择一个会话开始聊天</div>
            )}
          </section>
        </div>
      </div>
      <Footer startYear={2025} />

      {newChatOpen && (
        <div className={msgStyles.modalMask} onClick={() => setNewChatOpen(false)}>
          <div className={msgStyles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={msgStyles.modalHeader}>
              <span>发起会话</span>
              <button className={msgStyles.modalClose} onClick={() => setNewChatOpen(false)}>
                ×
              </button>
            </div>
            <div className={msgStyles.modalSearch}>
              <Input
                placeholder="搜索互相关注的用户"
                value={peerSearch}
                onChange={setPeerSearch}
                prefix={<FaSearch />}
                allowClear
                autoFocus
              />
            </div>
            <div className={msgStyles.modalList}>
              {peerLoading ? (
                <div className={msgStyles.convEmpty}>加载中...</div>
              ) : mutualUsers.length === 0 ? (
                <div className={msgStyles.convEmpty}>暂无互相关注的用户</div>
              ) : (
                mutualUsers.map((u) => (
                  <div key={u.id} className={msgStyles.modalItem} onClick={() => startChat(u)}>
                    <Avatar name={u.name} size={36} />
                    <div className={msgStyles.modalItemInfo}>
                      <div className={msgStyles.modalItemName}>{u.name}</div>
                      <div className={msgStyles.modalItemAccount}>@{u.account}</div>
                    </div>
                    {startingPeerId === u.id && <span className={msgStyles.modalItemLoading}>创建中...</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { encodeId } from "@/utils/hashId";
import ReactMarkdown from "react-markdown";
import { articleMarkdownComponents, articleMarkdownPlugins } from "@/components/articleView/markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import CommentNode from "@/components/commentTree/CommentNode";
import type { ArticleComment } from "@/types/comment";
import {
  Eye,
  Heart,
  MessageSquare,
  Clock,
  Calendar,
  FileText,
  Users,
  UserPlus,
  UserCheck,
  ThumbsUp,
  Send,
  Loader2,
} from "lucide-react";
import styles from "./ArticleView.module.css";
import Avatar from "@/components/avatar/Avatar";
import AiSummary from "@/components/articleView/AiSummary";
import FollowService from "@/services/followService";
import PraiseService from "@/services/praiseService";
import CommentService from "@/services/commentService";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import message from "@/components/message/Message";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface AuthorStats {
  followers: number;
  articles: number;
  likes: number;
}

interface ArticleViewProps {
  title: string;
  content: string;
  className?: string;
  author: string;
  authorAvatar?: string;
  authorId?: string | number;
  articleId?: string | number;
  authorStats?: AuthorStats;
  views: number;
  praises: number;
  update_time: string;
  pushlish_time: string;
  categories?: Array<{ id: number; name: string; color: string }>;
  labels?: Array<{ id: number; name: string; color: string }>;
  readingTime?: number;
}

const COMMENT_PAGE_SIZE = 20;

// 使用 react-markdown 期望的标题属性类型
interface HeadingComponentProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: number;
  node?: any;
}

const ArticleView: React.FC<ArticleViewProps> = ({
  title,
  author,
  authorAvatar,
  authorId,
  articleId,
  authorStats,
  views,
  praises,
  update_time,
  pushlish_time,
  content,
  className = "",
  categories = [],
  labels = [],
  readingTime,
}) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { settings } = useSiteSettings();
  const isOwnArticle = isAuthenticated && authorId != null && String(user?.id) === String(authorId);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isContentReady, setIsContentReady] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef<{ id: string; top: number } | null>(null);

  // 互动状态
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(authorStats?.followers ?? 0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [likesCount, setLikesCount] = useState(praises);
  const [authorLikesCount, setAuthorLikesCount] = useState(authorStats?.likes ?? 0);
  const [commentsList, setCommentsList] = useState<ArticleComment[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [likedCommentIds, setLikedCommentIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // 页面加载时判断是否已关注作者、是否已点赞
  useEffect(() => {
    if (!isAuthenticated) return;
    if (authorId) {
      FollowService.isFollowing(authorId)
        .then(setIsFollowing)
        .catch((err: any) => {
          console.error("检查关注状态失败:", err?.message || err);
        });
    }
    if (articleId) {
      PraiseService.isPraising(articleId)
        .then(setIsLiked)
        .catch((err: any) => {
          console.error("检查点赞状态失败:", err?.message || err);
        });
    }
  }, [isAuthenticated, authorId, articleId]);

  // 评论数据获取（供首次加载与轮询复用）
  const fetchComments = useCallback(() => {
    if (!articleId) return;
    CommentService.getList({ article_id: articleId, offset: 0, size: COMMENT_PAGE_SIZE })
      .then((data) => {
        setCommentsList(data.list);
        setLikedCommentIds((prev) => {
          const liked = new Set<number>();
          const collectLiked = (comments: ArticleComment[]) => {
            comments.forEach((c) => {
              if (c.is_liked) liked.add(c.id);
              if (c.replies?.length) collectLiked(c.replies);
            });
          };
          collectLiked(data.list);
          // 合并本地已有的点赞状态（用户操作过但服务端可能尚未反映的）
          prev.forEach((id) => liked.add(id));
          return liked;
        });
        setCommentLoading(false);
      })
      .catch(() => {});
  }, [articleId]);

  useEffect(() => {
    if (!articleId) return;
    setCommentLoading(true);
    fetchComments();
  }, [fetchComments]);

  // 评论轮询：每 15 秒自动刷新评论列表
  useEffect(() => {
    if (!articleId) return;
    const timer = setInterval(() => {
      fetchComments();
    }, 1500);
    return () => clearInterval(timer);
  }, [fetchComments]);

  const handleFollowToggle = async () => {
    if (!isAuthenticated) {
      message.info("请先登录");
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    if (!authorId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await FollowService.unfollow(authorId);
        setIsFollowing(false);
        setFollowersCount((c) => Math.max(0, c - 1));
        message.success("已取消关注");
      } else {
        await FollowService.follow(authorId);
        setIsFollowing(true);
        setFollowersCount((c) => c + 1);
        message.success("关注成功");
      }
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.message || "操作失败");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleLikeToggle = async () => {
    if (!isAuthenticated) {
      message.info("请先登录");
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    if (!articleId) return;
    setLikeLoading(true);
    try {
      const res = await PraiseService.toggle(articleId);
      setIsLiked(res.is_praising);
      setLikesCount(res.praise_count);
      setAuthorLikesCount((c) => (res.is_praising ? c + 1 : Math.max(0, c - 1)));
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.message || "操作失败");
    } finally {
      setLikeLoading(false);
    }
  };

  const handleCommentSubmit = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !articleId) return;
    if (!isAuthenticated) {
      message.info("请先登录");
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    try {
      const newComment = await CommentService.create({
        article_id: articleId,
        content: trimmed,
      });
      setCommentsList((prev) => [
        {
          id: newComment.id,
          user: newComment.user,
          avatar: newComment.avatar,
          user_id: newComment.user_id,
          content: newComment.content,
          time: newComment.time,
          likes: newComment.likes,
          replies: [],
          is_liked: newComment.is_liked,
          reply_count: newComment.reply_count,
        },
        ...prev,
      ]);
      setCommentText("");
      message.success("评论发表成功");
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.msg || err?.message || "评论发表失败");
    }
  };

  const handleReplySubmit = async (parentId: number) => {
    const trimmed = replyText.trim();
    if (!trimmed || !articleId) return;
    if (!isAuthenticated) {
      message.info("请先登录");
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    try {
      const newReply = await CommentService.create({
        article_id: articleId,
        content: trimmed,
        parent_id: parentId,
      });
      setCommentsList((prev) =>
        addReplyToTree(prev, parentId, {
          id: newReply.id,
          user: newReply.user,
          avatar: newReply.avatar,
          user_id: newReply.user_id,
          content: newReply.content,
          time: newReply.time,
          likes: newReply.likes,
          replies: [],
          is_liked: newReply.is_liked,
          reply_count: 0,
        }),
      );
      setReplyText("");
      setReplyToId(null);
      message.success("回复发表成功");
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.msg || err?.message || "回复发表失败");
    }
  };

  const handleCommentLike = async (commentId: number) => {
    if (!isAuthenticated) {
      message.info("请先登录");
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    try {
      const res = await CommentService.togglePraise(commentId);
      const delta = res.is_praising ? 1 : -1;
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        if (res.is_praising) {
          next.add(commentId);
        } else {
          next.delete(commentId);
        }
        return next;
      });
      setCommentsList((prev) => prev.map((c) => toggleCommentLike(c, commentId, delta)));
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.msg || err?.message || "操作失败");
    }
  };

  // 递归查找并更新评论/回复的点赞数
  const toggleCommentLike = (comment: ArticleComment, targetId: number, delta: number): ArticleComment => {
    if (comment.id === targetId) {
      return { ...comment, likes: comment.likes + delta };
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: comment.replies.map((r) => toggleCommentLike(r, targetId, delta)),
      };
    }
    return comment;
  };

  // 递归更新评论/回复的内容
  const updateComment = (comment: ArticleComment, targetId: number, newContent: string): ArticleComment => {
    if (comment.id === targetId) {
      return { ...comment, content: newContent };
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: comment.replies.map((r) => updateComment(r, targetId, newContent)),
      };
    }
    return comment;
  };

  // 递归向评论树中添加回复
  const addReplyToTree = (comments: ArticleComment[], parentId: number, newReply: ArticleComment): ArticleComment[] => {
    return comments.map((c) => {
      if (c.id === parentId) {
        const replies = Array.isArray(c.replies) ? c.replies : [];
        return { ...c, replies: [...replies, newReply] };
      }
      if (c.replies?.length) {
        return { ...c, replies: addReplyToTree(c.replies, parentId, newReply) };
      }
      return c;
    });
  };

  const handleStartEdit = (comment: ArticleComment) => {
    setEditingId(comment.id);
    setEditText(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = async (commentId: number) => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === commentsList.find((c) => c.id === commentId)?.content) return;
    try {
      await CommentService.update({ id: commentId, content: trimmed });
      setCommentsList((prev) => prev.map((c) => updateComment(c, commentId, trimmed)));
      setEditingId(null);
      setEditText("");
      message.success("评论已更新");
    } catch (err: any) {
      message.error(err?.response?.data?.msg || err?.msg || err?.message || "编辑失败");
    }
  };

  // 生成更安全的 ID
  const generateId = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // 提取标题
  useEffect(() => {
    const extractHeadings = (markdown: string): Heading[] => {
      const extracted: Heading[] = [];
      let fence: { marker: string; length: number } | null = null;

      markdown.split(/\r?\n/).forEach((line) => {
        const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fenceMatch) {
          const marker = fenceMatch[1][0];
          const markerLength = fenceMatch[1].length;

          if (!fence) {
            fence = { marker, length: markerLength };
            return;
          }

          if (marker === fence.marker && markerLength >= fence.length && fenceMatch[2].trim() === "") {
            fence = null;
          }
          return;
        }

        if (fence) return;

        const headingMatch = line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
        if (!headingMatch) return;

        const level = headingMatch[1].length;
        const text = headingMatch[2].trim().replace(/\s+#+\s*$/, "");
        extracted.push({ id: generateId(text), text, level });
      });

      return extracted;
    };

    const extractedHeadings = extractHeadings(content);
    setHeadings(extractedHeadings);

    // 延迟设置内容准备就绪，确保 DOM 已经渲染
    setTimeout(() => {
      setIsContentReady(true);
    }, 100);
  }, [content]);

  // 根据实际滚动容器的位置更新目录，并处理首尾标题无法越过激活线的边界情况。
  useEffect(() => {
    if (!contentRef.current || headings.length === 0) return;

    const scrollContainer = contentRef.current.closest<HTMLElement>(".simplebar-content-wrapper");
    const scrollTarget: HTMLElement | Window = scrollContainer ?? window;
    let frameId = 0;

    const updateActiveHeading = () => {
      const scrollTop = scrollContainer?.scrollTop ?? window.scrollY;
      const scrollHeight = scrollContainer?.scrollHeight ?? document.documentElement.scrollHeight;
      const clientHeight = scrollContainer?.clientHeight ?? window.innerHeight;
      const programmaticScroll = programmaticScrollRef.current;

      if (programmaticScroll) {
        setActiveId(programmaticScroll.id);
        if (Math.abs(scrollTop - programmaticScroll.top) <= 2) {
          programmaticScrollRef.current = null;
        }
        return;
      }

      if (scrollTop <= 8) {
        setActiveId(headings[0].id);
        if (window.location.hash) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
        return;
      }

      if (scrollTop + clientHeight >= scrollHeight - 8) {
        setActiveId(headings[headings.length - 1].id);
        return;
      }

      const containerTop = scrollContainer?.getBoundingClientRect().top ?? 0;
      const activationLine = containerTop + 100;
      let currentId = "";

      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= activationLine) {
          currentId = heading.id;
        } else if (element) {
          break;
        }
      }

      setActiveId(currentId);
    };

    const handleScroll = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateActiveHeading);
    };

    const handleBackToTop = () => {
      programmaticScrollRef.current = { id: headings[0].id, top: 0 };
      setActiveId(headings[0].id);
    };

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("app:scroll-to-top", handleBackToTop);
    updateActiveHeading();

    return () => {
      scrollTarget.removeEventListener("scroll", handleScroll);
      window.removeEventListener("app:scroll-to-top", handleBackToTop);
      window.cancelAnimationFrame(frameId);
    };
  }, [headings]);

  // 修复目录点击跳转
  const handleTocClick = useCallback((id: string, event: React.MouseEvent) => {
    event.preventDefault();

    const element = document.getElementById(id);
    if (element) {
      const scrollContainer = element.closest(".simplebar-content-wrapper");
      const top = scrollContainer
        ? element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop - 76
        : element.getBoundingClientRect().top + window.scrollY - 76;
      const maxScrollTop = scrollContainer
        ? scrollContainer.scrollHeight - scrollContainer.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const targetTop = Math.max(0, Math.min(top, maxScrollTop));

      programmaticScrollRef.current = { id, top: targetTop };
      setActiveId(id);

      (scrollContainer ?? window).scrollTo({
        top: targetTop,
        behavior: "smooth",
      });

      // 更新URL的hash（可选）
      window.history.pushState(null, "", `#${id}`);
    }
  }, []);

  // 复制代码功能
  const handleCopyCode = useCallback((code: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(() => {
          message.success("代码已复制");
        })
        .catch(() => {
          message.error("复制失败");
        });
    } else {
      // 降级方案：非 HTTPS / 旧浏览器
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        message.success("代码已复制");
      } catch {
        message.error("复制失败");
      }
      document.body.removeChild(textarea);
    }
  }, []);

  // 创建标题组件
  const createHeadingComponent = (level: number) => {
    return ({ children, ...props }: HeadingComponentProps) => {
      const text = React.Children.toArray(children).join("");
      const id = generateId(text);

      switch (level) {
        case 1:
          return (
            <h1 id={id} {...props}>
              {children}
            </h1>
          );
        case 2:
          return (
            <h2 id={id} {...props}>
              {children}
            </h2>
          );
        case 3:
          return (
            <h3 id={id} {...props}>
              {children}
            </h3>
          );
        case 4:
          return (
            <h4 id={id} {...props}>
              {children}
            </h4>
          );
        case 5:
          return (
            <h5 id={id} {...props}>
              {children}
            </h5>
          );
        case 6:
          return (
            <h6 id={id} {...props}>
              {children}
            </h6>
          );
        default:
          return (
            <h2 id={id} {...props}>
              {children}
            </h2>
          );
      }
    };
  };

  // 简化段落组件 - 不要干预代码块处理
  const ParagraphComponent: React.FC<React.HTMLAttributes<HTMLParagraphElement> & { node?: any }> = ({ children, ...props }) => {
    return <p {...props}>{children}</p>;
  };

  const getTocItemClass = (level: number, id: string) => {
    const baseClass = styles.tocItem;
    const levelClass = level === 1 ? styles.tocItemH1 : level === 2 ? styles.tocItemH2 : styles.tocItemH3;
    const activeClass = id === activeId ? styles.active : "";

    return `${baseClass} ${levelClass} ${activeClass}`.trim();
  };

  return (
    <div className={`${styles.container} ${className} ${!isContentReady ? styles.loading : styles.ready}`} ref={contentRef}>
      <aside className={styles.sidebar}>
        {/* 作者卡片 */}
        <div className={styles.authorCard}>
          <div className={styles.authorCardTop}>
            <div className={styles.authorCardAvatar} onClick={() => authorId && navigate(`/profile/${encodeId(authorId, "user")}`)}>
              <Avatar src={authorAvatar} name={author} size={64} className={styles.authorCardAvatarImg} />
            </div>
            <div className={styles.authorCardInfo}>
              <span className={styles.authorCardName} onClick={() => authorId && navigate(`/profile/${encodeId(authorId, "user")}`)}>
                {author}
              </span>
              <span className={styles.authorCardMeta}>{pushlish_time} 发布</span>
              {authorStats && (
                <div className={styles.authorCardStats}>
                  <span className={styles.authorStatItem}>
                    <FileText size={12} />
                    {authorStats.articles}
                  </span>
                  <span className={styles.authorStatItem}>
                    <Users size={12} />
                    {followersCount}
                  </span>
                  <span className={styles.authorStatItem}>
                    <Heart size={12} />
                    {authorLikesCount}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className={styles.authorCardActions}>
            {!isOwnArticle && (
              <button
                className={`${styles.followButton} ${isFollowing ? styles.following : ""}`}
                onClick={handleFollowToggle}
                disabled={followLoading}
              >
                {followLoading ? (
                  <Loader2 size={14} className={styles.loadingSpin} />
                ) : isFollowing ? (
                  <>
                    <UserCheck size={14} />
                    已关注
                  </>
                ) : (
                  <>
                    <UserPlus size={14} />
                    关注作者
                  </>
                )}
              </button>
            )}
            <button
              className={`${styles.followButton} ${isLiked ? styles.following : ""}`}
              onClick={handleLikeToggle}
              disabled={likeLoading}
            >
              {likeLoading ? (
                <Loader2 size={14} className={styles.loadingSpin} />
              ) : (
                <>
                  <ThumbsUp size={14} className={isLiked ? styles.likeIconActive : ""} />
                  {isLiked ? "已点赞" : "点赞文章"}
                </>
              )}
            </button>
          </div>
        </div>

        {(categories.length > 0 || labels.length > 0) && (
          <div className={styles.tagCard}>
            <div className={styles.tagCardTitle}>分类 & 标签</div>
            <div className={styles.tagCardContent}>
              {categories.map((cat) => (
                <span key={`cat-${cat.id}`} className={styles.categoryBadge}>
                  {cat.name}
                </span>
              ))}
              {labels.map((label) => (
                <span key={`label-${label.id}`} className={styles.labelTag}>
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {headings.length > 0 && (
          <nav className={styles.toc}>
            <div className={styles.tocTitle}>目录</div>
            <div className={styles.tocList}>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={getTocItemClass(heading.level, heading.id)}
                  onClick={(e) => handleTocClick(heading.id, e)}
                >
                  {heading.text}
                </a>
              ))}
            </div>
          </nav>
        )}
      </aside>
      <div className={styles.content}>
        <article className={styles.article}>
          {/* 文章头部 */}
          <header className={styles.articleHeader}>
            <h1 className={styles.title}>{title}</h1>

            <div className={styles.metaRow}>
              <span className={styles.metaItem}>
                <Calendar size={13} />
                {pushlish_time} 发布
              </span>
              {update_time !== pushlish_time && <span className={styles.metaItem}>{update_time} 更新</span>}
              <span className={styles.metaItem}>
                <Eye size={14} />
                {views} 阅读
              </span>
              <span className={styles.metaItem}>
                <Heart size={14} />
                {likesCount} 点赞
              </span>
              <span className={styles.metaItem}>
                <MessageSquare size={14} />
                {commentsList.length} 评论
              </span>
              {readingTime && (
                <span className={styles.metaItem}>
                  <Clock size={14} />
                  {readingTime} 分钟阅读
                </span>
              )}
            </div>
          </header>

          <AiSummary articleId={articleId} />

          <div className={`${styles.markdownBody} ${!isContentReady ? styles.contentLoading : styles.contentReady}`}>
            {!isContentReady && (
              <div className={styles.loadingIndicator}>
                <div className={styles.spinner}></div>
                <span>正在渲染文章内容...</span>
              </div>
            )}
            <ReactMarkdown
              {...articleMarkdownPlugins}
              components={articleMarkdownComponents({
                styles,
                paragraph: ParagraphComponent,
                heading: createHeadingComponent,
                onCopy: handleCopyCode,
                trimCode: true,
                unwrapPre: true,
                renderCode: (code, language) => (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    showLineNumbers
                    customStyle={{ margin: 0, borderRadius: "0 0 8px 8px", fontSize: "14px" }}
                  >
                    {code}
                  </SyntaxHighlighter>
                ),
              })}
              skipHtml={false}
              unwrapDisallowed={false}
            >
              {content}
            </ReactMarkdown>
          </div>
        </article>

        {/* 评论区域 */}
        {settings.allowComments ? (
          <div className={styles.commentSection}>
            <div className={styles.commentHeader}>
              <h3 className={styles.commentTitle}>
                <MessageSquare size={18} />
                评论 ({commentsList.length})
              </h3>
              <button className={styles.writeCommentButton} onClick={() => setShowCommentInput(!showCommentInput)}>
                {showCommentInput ? "收起" : "写评论"}
              </button>
            </div>

            {/* 评论输入框 */}
            {showCommentInput && (
              <div className={styles.commentInputWrapper}>
                <textarea
                  className={styles.commentTextarea}
                  placeholder="写下你的想法..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                />
                <div className={styles.commentInputFooter}>
                  <span className={styles.commentHint}>
                    支持 Markdown 语法
                    {settings.moderateComments && " · 评论需审核后显示"}
                  </span>
                  <button className={styles.commentSubmitButton} onClick={handleCommentSubmit} disabled={!commentText.trim()}>
                    <Send size={14} />
                    发布
                  </button>
                </div>
              </div>
            )}

            {/* 评论列表 */}
            <div className={styles.commentList}>
              {commentLoading ? (
                <div className={styles.commentEmpty}>加载评论中...</div>
              ) : commentsList.length === 0 ? (
                <div className={styles.commentEmpty}>暂无评论，快来抢沙发吧~</div>
              ) : (
                commentsList.map((comment) => (
                  <CommentNode
                    key={comment.id}
                    comment={comment}
                    depth={0}
                    likedCommentIds={likedCommentIds}
                    editingId={editingId}
                    editText={editText}
                    replyToId={replyToId}
                    replyText={replyText}
                    currentUserId={user?.id != null ? Number(user.id) : undefined}
                    isAuthenticated={isAuthenticated}
                    onLike={handleCommentLike}
                    onToggleReply={(id) => setReplyToId(replyToId === id ? null : id)}
                    onStartEdit={handleStartEdit}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onReplyTextChange={setReplyText}
                    onReplySubmit={handleReplySubmit}
                    onReplyCancel={() => {
                      setReplyToId(null);
                      setReplyText("");
                    }}
                    onEditTextChange={setEditText}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className={styles.commentSection}>
            <div className={styles.commentEmpty}>评论功能已关闭</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticleView;

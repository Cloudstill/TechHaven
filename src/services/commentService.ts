import http from "../utils/http";
import type {
  CommentListResponse,
  CreateCommentResponse,
  CommentPraiseResponse,
  AdminCommentListResponse,
  BatchOperationResponse,
  CommentStatsResponse,
} from "../types/comment";

export class CommentService {
  /** 获取文章评论列表 */
  static async getList(params: { article_id: number | string; offset?: number; size?: number }): Promise<CommentListResponse> {
    const response = await http.get<CommentListResponse>("/article/comment/list", { params });
    return response.data;
  }

  /** 获取评论的回复列表 */
  static async getReplies(params: { comment_id: number | string; offset?: number; size?: number }): Promise<CommentListResponse> {
    const response = await http.get<CommentListResponse>("/article/comment/replies", { params });
    return response.data;
  }

  /** 发表评论 */
  static async create(params: { article_id: number | string; content: string; parent_id?: number }): Promise<CreateCommentResponse> {
    const formData = new URLSearchParams();
    formData.append("article_id", String(params.article_id));
    formData.append("content", params.content);
    if (params.parent_id !== undefined) {
      formData.append("parent_id", String(params.parent_id));
    }
    const response = await http.postForm<CreateCommentResponse>("/article/comment/create", formData);
    return response.data;
  }

  /** 编辑评论 */
  static async update(params: { id: number | string; content: string }): Promise<CreateCommentResponse> {
    const formData = new URLSearchParams();
    formData.append("id", String(params.id));
    formData.append("content", params.content);
    const response = await http.postForm<CreateCommentResponse>("/article/comment/update", formData);
    return response.data;
  }

  /** 删除评论 */
  static async delete(id: number | string): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("id", String(id));
    await http.postForm("/article/comment/delete", formData);
  }

  /** 评论点赞/取消点赞 */
  static async togglePraise(commentId: number | string): Promise<CommentPraiseResponse> {
    const formData = new URLSearchParams();
    formData.append("comment_id", String(commentId));
    const response = await http.postForm<CommentPraiseResponse>("/article/comment/praise", formData);
    return response.data;
  }

  // ============ 管理端 ============

  /** 管理端评论列表 */
  static async getAdminList(params: {
    page_num: number;
    page_size: number;
    status?: string;
    keyword?: string;
    article_id?: string;
    is_reported?: number;
  }): Promise<AdminCommentListResponse> {
    const response = await http.get<AdminCommentListResponse>("/admin/comment/list", { params });
    return response.data;
  }

  /** 批量批准 */
  static async approve(ids: string[]): Promise<BatchOperationResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", ids.join(","));
    const response = await http.postForm<BatchOperationResponse>("/admin/comment/approve", formData);
    return response.data;
  }

  /** 批量拒绝 */
  static async reject(ids: string[]): Promise<BatchOperationResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", ids.join(","));
    const response = await http.postForm<BatchOperationResponse>("/admin/comment/reject", formData);
    return response.data;
  }

  /** 批量标记垃圾 */
  static async markSpam(ids: string[]): Promise<BatchOperationResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", ids.join(","));
    const response = await http.postForm<BatchOperationResponse>("/admin/comment/spam", formData);
    return response.data;
  }

  /** 批量删除 */
  static async batchDelete(ids: string[]): Promise<BatchOperationResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", ids.join(","));
    const response = await http.postForm<BatchOperationResponse>("/admin/comment/delete", formData);
    return response.data;
  }

  /** 管理端评论统计 */
  static async getAdminStats(): Promise<CommentStatsResponse> {
    const response = await http.get<CommentStatsResponse>("/admin/comment/stats");
    return response.data;
  }
}

export default CommentService;

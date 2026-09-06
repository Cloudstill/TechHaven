import http from "../utils/http";
import type { FollowListResponse, MutualFollowListResponse } from "../types/follow";

/**
 * 关注服务
 */
export class FollowService {
  /**
   * 关注用户
   */
  static async follow(followingId: number | string): Promise<void> {
    await http.postForm("/user/follow", { following_id: followingId });
  }

  /**
   * 取消关注
   */
  static async unfollow(followingId: number | string): Promise<void> {
    await http.postForm("/user/unfollow", { following_id: followingId });
  }

  /**
   * 判断是否已关注某用户
   */
  static async isFollowing(userId: number | string): Promise<boolean> {
    const response = await http.get<{ is_following: boolean }>("/user/is_following", {
      params: { user_id: userId },
    });
    return response.data.is_following;
  }

  /**
   * 获取关注列表
   * @param userId 不传则查当前用户
   */
  static async getFollowingList(params?: { user_id?: number | string; offset?: number; size?: number }): Promise<FollowListResponse> {
    const response = await http.get<FollowListResponse>("/user/following/list", { params });
    return response.data;
  }

  /**
   * 获取粉丝列表
   * @param userId 不传则查当前用户
   */
  static async getFollowerList(params?: { user_id?: number | string; offset?: number; size?: number }): Promise<FollowListResponse> {
    const response = await http.get<FollowListResponse>("/user/follower/list", { params });
    return response.data;
  }

  /**
   * 获取互相关注的用户列表（发起私信会话的搜索数据源）
   */
  static async getMutualFollowingList(params?: {
    keyword?: string;
    offset?: number;
    size?: number;
  }): Promise<MutualFollowListResponse> {
    const response = await http.get<MutualFollowListResponse>("/user/mutual_following/list", {
      params: {
        keyword: params?.keyword ?? "",
        offset: params?.offset ?? 0,
        size: params?.size ?? 20,
      },
    });
    return response.data;
  }
}

export default FollowService;

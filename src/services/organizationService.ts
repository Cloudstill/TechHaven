import http from "../utils/http";

/**
 * 创建组织参数
 */
export interface CreateOrganizationParams {
  id?: string | number;
  name: string;
  type: string;
  status: number | string;
  description?: string;
}

/**
 * 创建组织响应
 */
export interface CreateOrganizationResponse {
  id: number | string;
  name: string;
  type: string;
  status: number | string;
  description: string;
  create_time: number;
}

export interface GetAdminOrganizationsParams {
  page_num: number;
  page_size: number;
  status?: number;
}

export interface GetAdminOrganizationsResponse {
  total: number;
  list: Array<{
    id: number | string;
    name: string;
    type: string;
    status: number | string;
    description: string;
    create_time: number;
    count: number;
  }>;
}

/**
 * 删除组织参数
 */
/**
 * 管理端组织统计响应类型
 */
export interface OrganizationStatsResponse {
  total_organizations: number;
  active_organizations: number;
  inactive_organizations: number;
}

export interface DeleteOrganizationParams {
  ids: string; // 逗号分隔的ID
}

/**
 * 删除组织响应
 */
export interface DeleteOrganizationResponse {
  ids: Array<number | string>;
}

/**
 * 获取组织列表参数
 */
export interface GetOrganizationListsParams {
  status?: number;
}

/**
 * 获取组织列表响应
 */
export interface GetOrganizationListsResponse {
  total: number;
  list: Array<{
    id: number | string;
    name: string;
    type: string;
    status: number | string;
    description: string;
    count: number;
  }>;
}

/**
 * 获取组织详情参数
 */
export interface GetOrganizationDetailParams {
  id: number | string;
}

/**
 * 获取组织详情响应
 */
export interface GetOrganizationDetailResponse {
  id: number | string;
  name: string;
  type: string;
  status: number | string;
  description: string;
  user_in_org?: number;
  user_role?: number;
}

export interface JoinOrganizationParams {
  id: number | string;
}

export interface JoinOrganizationResponse {
  id: number | string;
  name: string;
  type: string;
  status: number | string;
  description: string;
  user_in_org: number;
}

export interface organizationUserListsParams {
  id: number | string;
  page_num: number;
  page_size: number;
  status: 0 | 1 | 2 | 3;
}

export interface organizationUserListsResponse {
  total: number;
  list: Array<{
    id: number | string;
    user_id: number | string;
    name: string;
    avatar: string;
    email: string;
    role: number;
    join_time: number;
  }>;
}

export interface organizationJoinCheckParams {
  user_id: number | string;
  org_id: number | string;
  state: number;
  role?: number;
}

export interface organizationJoinCheckResponse {
  success: number;
}

export interface organizationKickParams {
  id: number | string;
  user_id: number | string;
  org_id: number | string;
}

export interface organizationKickResponse {
  success: number;
}

export interface organizationSetRoleParams {
  id: number | string;
  user_id: number | string;
  org_id: number | string;
  role: number;
}

export interface organizationSetRoleResponse {
  id: number | string;
  user_id: number | string;
  name: string;
  avatar: string;
  email: string;
  role: number;
  status: number;
  join_time: number;
}

/**
 * 申请创建组织参数
 */
export interface ApplyCreateOrganizationParams {
  name: string;
  type: string;
  description?: string;
}

/**
 * 申请创建组织响应
 */
export interface ApplyCreateOrganizationResponse {
  apply_id: string;
}

/**
 * 获取申请列表参数
 */
export interface GetApplyListParams {
  page_num: number;
  page_size: number;
  status?: number; // 0=pending, 1=approved, 2=rejected
}

/**
 * 申请单项
 */
export interface ApplyItem {
  id: string;
  user_id: string;
  user_name: string;
  org_name: string;
  org_type: string;
  org_description: string;
  status: number; // 0=pending, 1=approved, 2=rejected
  review_reason: string;
  created_at: number;
  reviewed_at: number;
}

/**
 * 获取申请列表响应
 */
export interface GetApplyListResponse {
  total: number;
  list: ApplyItem[];
}

/**
 * 审核申请参数
 */
export interface ReviewApplyParams {
  apply_id: string;
  action: "approve" | "reject";
  reason?: string;
}

/**
 * 审核申请响应
 */
export interface ReviewApplyResponse {
  org_id?: string;
}

export interface userOrganizationListsParams {}

export interface userOrganizationListsResponse {
  list: Array<{
    id: number | string;
    org_id: number | string;
    org_name: string;
    org_description: string;
    type: string;
    role: number;
    join_time: number;
    count: number;
  }>;
}
/**
 * 组织服务类
 */
export class OrganizationService {
  /**
   * 创建组织
   */
  static async createOrganization(params: CreateOrganizationParams): Promise<CreateOrganizationResponse> {
    const formData = new URLSearchParams();
    if (params.id !== undefined && params.id !== null && params.id !== "") {
      formData.append("id", String(params.id));
    }
    formData.append("name", params.name);
    formData.append("type", params.type);
    formData.append("status", String(params.status));
    if (params.description) {
      formData.append("desc", params.description);
    }

    const response = await http.postForm<CreateOrganizationResponse>("/organization/create", formData);
    return response.data;
  }

  /**
   * 分页获取组织列表 (Admin)
   */
  static async getAdminOrganizations(params: GetAdminOrganizationsParams): Promise<GetAdminOrganizationsResponse> {
    let url = `/organization/admin/lists?page_num=${params.page_num}&page_size=${params.page_size}`;
    if (params.status != -1 && params.status !== undefined) {
      url += `&status=${params.status}`;
    }

    const response = await http.get<GetAdminOrganizationsResponse>(url);
    return response.data;
  }

  /**
   * 获取管理端组织统计数据
   */
  static async getAdminOrganizationStats(): Promise<OrganizationStatsResponse> {
    const response = await http.get<OrganizationStatsResponse>("/organization/admin/stats");
    return response.data;
  }

  /**
   * 删除组织 (Admin)
   */
  static async deleteOrganizations(params: DeleteOrganizationParams): Promise<DeleteOrganizationResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", params.ids);

    const response = await http.postForm<DeleteOrganizationResponse>("/organization/delete", formData);
    return response.data;
  }

  /**
   * 获取组织列表
   */
  static async getOrganizationLists(params: GetOrganizationListsParams): Promise<GetOrganizationListsResponse> {
    let url = "/organization/list?";
    if (params.status != -1 && params.status !== undefined && params.status !== null) {
      url += `status=${params.status}`;
    }

    const response = await http.get<GetOrganizationListsResponse>(url);
    return response.data;
  }

  /**
   * 获取组织详情
   */
  static async getOrganizationDetail(params: GetOrganizationDetailParams): Promise<GetOrganizationDetailResponse> {
    const url = `/organization/detail?id=${params.id}`;

    const response = await http.get<GetOrganizationDetailResponse>(url);
    return response.data;
  }

  /**
   * 加入组织
   */
  static async joinOrganization(params: JoinOrganizationParams): Promise<JoinOrganizationResponse> {
    const formData = new URLSearchParams();
    formData.append("id", String(params.id));

    const response = await http.postForm<JoinOrganizationResponse>("/organization/join", formData);
    return response.data;
  }

  static async getOrganizationUserLists(params: organizationUserListsParams): Promise<organizationUserListsResponse> {
    const url = `/organization/user_list?id=${params.id}&page_num=${params.page_num}&page_size=${params.page_size}&status=${params.status}`;

    const response = await http.get<organizationUserListsResponse>(url);
    return response.data;
  }

  static async organizationJoinCheck(params: organizationJoinCheckParams): Promise<organizationJoinCheckResponse> {
    const formData = new URLSearchParams();
    formData.append("user_id", String(params.user_id));
    formData.append("org_id", String(params.org_id));
    formData.append("state", String(params.state));
    if (params.role !== undefined) {
      formData.append("role", String(params.role));
    }

    const response = await http.postForm<organizationJoinCheckResponse>("/organization/join_check", formData);
    return response.data;
  }

  static async userOrganizationLists(): Promise<userOrganizationListsResponse> {
    const url = `/user/organization/list`;

    const response = await http.get<userOrganizationListsResponse>(url);
    return response.data;
  }

  /**
   * 踢出组织成员
   */
  static async kickOrganizationMember(params: organizationKickParams): Promise<organizationKickResponse> {
    const formData = new URLSearchParams();
    formData.append("id", String(params.id));
    formData.append("user_id", String(params.user_id));
    formData.append("org_id", String(params.org_id));

    const response = await http.postForm<organizationKickResponse>("/organization/user_kick", formData);
    return response.data;
  }

  /**
   * 设置组织成员角色
   */
  static async setOrganizationMemberRole(params: organizationSetRoleParams): Promise<organizationSetRoleResponse> {
    const formData = new URLSearchParams();
    formData.append("id", String(params.id));
    formData.append("user_id", String(params.user_id));
    formData.append("org_id", String(params.org_id));
    formData.append("role", String(params.role));

    const response = await http.postForm<organizationSetRoleResponse>("/organization/user_switch_role", formData);
    return response.data;
  }

  /**
   * 申请创建组织
   */
  static async applyCreateOrganization(params: ApplyCreateOrganizationParams): Promise<ApplyCreateOrganizationResponse> {
    const formData = new URLSearchParams();
    formData.append("name", params.name);
    formData.append("type", params.type);
    if (params.description) {
      formData.append("desc", params.description);
    }

    const response = await http.postForm<ApplyCreateOrganizationResponse>("/organization/apply-create", formData);
    return response.data;
  }

  /**
   * 获取组织申请列表 (Admin)
   */
  static async getApplyList(params: GetApplyListParams): Promise<GetApplyListResponse> {
    let url = `/organization/apply-list?page_num=${params.page_num}&page_size=${params.page_size}`;
    if (params.status !== undefined && params.status !== null) {
      url += `&status=${params.status}`;
    }

    const response = await http.get<GetApplyListResponse>(url);
    return response.data;
  }

  /**
   * 审核组织申请 (Admin)
   */
  static async reviewApply(params: ReviewApplyParams): Promise<ReviewApplyResponse> {
    const formData = new URLSearchParams();
    formData.append("apply_id", params.apply_id);
    formData.append("action", params.action);
    if (params.reason) {
      formData.append("reason", params.reason);
    }

    const response = await http.postForm<ReviewApplyResponse>("/organization/apply-review", formData);
    return response.data;
  }

  /**
   * 获取我的组织申请列表
   */
  static async getMyApplies(params: { page_num: number; page_size: number }): Promise<GetApplyListResponse> {
    const url = `/organization/my-applies?page_num=${params.page_num}&page_size=${params.page_size}`;

    const response = await http.get<GetApplyListResponse>(url);
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // 组织仓库
  // ---------------------------------------------------------------------------

  /**
   * 获取组织仓库列表
   */
  static async getRepos(params: { org_id: string; page?: number; page_size?: number }): Promise<{
    list: Array<{
      id: number | string;
      org_id: number | string;
      name: string;
      description: string;
      url: string;
      language: string;
      stars_count: number;
      updated_at: string;
      created_at: string;
    }>;
    total: number;
  }> {
    const { org_id, page = 1, page_size = 20 } = params;
    const url = `/organization/repos?org_id=${org_id}&page=${page}&page_size=${page_size}`;
    const response = await http.get<any>(url);
    return response.data;
  }

  /**
   * 添加仓库
   */
  static async addRepo(params: {
    org_id: string;
    name: string;
    url: string;
    description?: string;
    token?: string;
  }): Promise<{ id: number | string }> {
    const formData = new URLSearchParams();
    formData.append("org_id", params.org_id);
    formData.append("name", params.name);
    formData.append("url", params.url);
    if (params.description) formData.append("description", params.description);
    if (params.token) formData.append("token", params.token);

    const response = await http.postForm<{ id: number | string }>("/organization/repos/add", formData);
    return response.data;
  }

  /**
   * 删除仓库
   */
  static async deleteRepo(params: { id: string; org_id: string }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("id", params.id);
    formData.append("org_id", params.org_id);

    await http.postForm("/organization/repos/delete", formData);
  }

  /**
   * 获取仓库统计
   */
  static async getRepoStats(orgId: string): Promise<{ total_repos: number }> {
    const response = await http.get<{ total_repos: number }>(`/organization/repos/stats?org_id=${orgId}`);
    return response.data;
  }

  /**
   * 获取组织成员统计
   */
  static async getStats(orgId: string): Promise<{
    total_members: number;
    active_members: number;
    org_admin_count: number;
    regular_count: number;
  }> {
    const response = await http.get<any>(`/organization/stats?id=${orgId}`);
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // 仓库 Token
  // ---------------------------------------------------------------------------

  /**
   * 为单个仓库保存/更新 GitHub Token
   */
  static async saveRepoToken(params: { repo_id: string; token: string }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("repo_id", params.repo_id);
    formData.append("token", params.token);
    await http.postForm("/organization/repos/token", formData);
  }

  /**
   * 触发仓库同步（后端调 GitHub API 拉取仓库元数据）
   */
  static async syncRepo(params: { repo_id: string }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("repo_id", params.repo_id);
    await http.postForm("/organization/repos/sync", formData);
  }

  // ---------------------------------------------------------------------------
  // PR 同步与列表
  // ---------------------------------------------------------------------------

  /**
   * 获取 PR 列表
   */
  static async getPrs(params: {
    org_id?: string;
    repo_id?: string;
    state?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ total: number; page: number; page_size: number; list: any[] }> {
    const q: string[] = [];
    if (params.org_id) q.push(`org_id=${params.org_id}`);
    if (params.repo_id) q.push(`repo_id=${params.repo_id}`);
    if (params.state) q.push(`state=${params.state}`);
    if (params.page) q.push(`page=${params.page}`);
    if (params.page_size) q.push(`page_size=${params.page_size}`);
    const url = `/organization/repos/prs${q.length > 0 ? "?" + q.join("&") : ""}`;
    const response = await http.get<any>(url);
    return response.data;
  }

  /**
   * 触发仓库 PR 同步
   */
  static async syncPrs(params: { repo_id: string }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("repo_id", params.repo_id);
    await http.postForm("/organization/repos/prs/sync", formData);
  }

  /**
   * 删除 PR（仅删除本地记录，不影响 GitHub）
   */
  static async deletePr(params: { id: string }): Promise<void> {
    const formData = new URLSearchParams();
    formData.append("id", params.id);
    await http.postForm("/organization/repos/prs/delete", formData);
  }
}

export default OrganizationService;

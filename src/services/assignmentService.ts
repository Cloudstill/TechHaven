import http from "../utils/http";

/**
 * 创建作业参数
 */
export interface CreateAssignmentParams {
  id?: string | number;
  name: string;
  subject_name: string;
  end_time: string;
  file_size: number;
  status: number | string;
  priority: number;
  file_type: string;
  description: string;
}

/**
 * 创建作业响应
 */
export interface CreateAssignmentResponse {
  id: number | string;
  name: string;
  subject_name: string;
  end_time: number;
  file_size: number;
  status: string;
  file_type: string;
  description: string;
  create_time: number;
}

export interface CreateOrganizationAssignmentParams {
  org_id: string | number;
  name: string;
  subject_name: string;
  end_time: number;
  max_size: number;
  status: number;
  priority: number;
  file_type: string;
  description: string;
  assign_id?: number | string;
}

export interface CreateOrganizationAssignmentResponse {
  id: number | string; // 作业ID
  assign_id?: number | string; // 分配ID
  assigned_by?: string; // 分配者name
  name: string;
  subject_name: string;
  end_time: number;
  max_size: number;
  status: number;
  priority: number;
  file_type: string;
  description: string;
}

export interface OrganizationAssignmentListItem {
  org_id: string | number;
  page_num: number;
  page_size: number;
  status: number;
}

export interface OrganizationAssignmentListResponse {
  total: number;
  list: Array<CreateOrganizationAssignmentResponse>;
}

export interface GetAdminAssignmentsParams {
  page_num: number;
  page_size: number;
  state?: number;
}

export interface GetAdminAssignmentsResponse {
  total: number;
  list: Array<{
    id: string | number;
    name: string;
    subject_name: string;
    organization_name: string;
    assigned_by: string;
    end_time: number;
    status: string;
    priority: number;
    create_time: number;
    file_size: number;
    file_type: string;
    description: string;
  }>;
}

export interface GetUserAssignmentsParams {}

export interface GetUserAssignmentsResponse {
  total: number;
  list: Array<{
    id: string | number;
    name: string;
    subject_name: string;
    end_time: number;
    status: number;
    priority: number;
    create_time: number;
    file_size: number;
    file_type: string;
    description: string;
  }>;
}

/**
 * 删除作业参数
 */
export interface DeleteAssignmentParams {
  ids: string; // 逗号分隔的ID
}

/**
 * 删除作业响应
 */
/**
 * 管理端任务统计响应类型
 */
export interface AssignmentStatsResponse {
  total_assignments: number;
  active_assignments: number;
  closed_assignments: number;
  draft_assignments: number;
}

export interface DeleteAssignmentResponse {
  ids: Array<number | string>;
}

export interface GetAssignmentDetailParams {
  id: number | string;
}

export interface GetAssignmentDetailResponse {
  id: number | string;
  name: string;
  status: string;
  priority: number;
  subject_name: string;
  description: string;
  end_time: number;
  file_size: number;
  file_type: string;
}

export interface AssignmentSubmissionItem {
  id: string | number;
  file_name: string;
  file_path: string;
  file_size: number;
  score?: number;
  feedback?: string;
}

export interface GetAssignmentSubmissionsResponse {
  user_id: string | number;
  user_name: string;
  user_avatar?: string;
  submit_time: number;
  status: number;
  total?: number;
  list?: Array<AssignmentSubmissionItem>;
}

/**
 * 学科与作业服务类
 */
export class AssignmentService {
  /**
   * 创建作业 (Admin)
   */
  static async createAssignment(params: CreateAssignmentParams): Promise<CreateAssignmentResponse> {
    const formData = new URLSearchParams();
    if (params.id !== undefined && params.id !== null && params.id !== "") {
      formData.append("id", String(params.id));
    }
    formData.append("name", params.name);
    formData.append("subject_name", params.subject_name);
    formData.append("end_time", params.end_time);
    formData.append("file_size", String(params.file_size));
    formData.append("status", String(params.status));
    formData.append("priority", String(params.priority));
    formData.append("file_type", params.file_type);
    formData.append("description", params.description);

    const response = await http.postForm<CreateAssignmentResponse>("/assignment/create", formData);
    return response.data;
  }

  /**
   * 分页获取作业列表 (Admin)
   */
  static async getAdminAssignments(params: GetAdminAssignmentsParams): Promise<GetAdminAssignmentsResponse> {
    let url = `/assignment/admin/lists?page_num=${params.page_num}&page_size=${params.page_size}`;
    if (params.state != -1 && params.state !== undefined) {
      url += `&state=${params.state}`;
    }

    const response = await http.get<GetAdminAssignmentsResponse>(url);
    return response.data;
  }

  /**
   * 删除作业 (Admin)
   */
  static async deleteAssignments(params: DeleteAssignmentParams): Promise<DeleteAssignmentResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", params.ids);

    const response = await http.postForm<DeleteAssignmentResponse>("/assignment/delete", formData);
    return response.data;
  }

  /**
   * 创建组织作业 (Organization Admin)
   */
  static async createOrganizationAssignment(
    params: CreateOrganizationAssignmentParams,
  ): Promise<CreateOrganizationAssignmentResponse> {
    const formData = new URLSearchParams();
    if (params.assign_id !== undefined && params.assign_id !== null && params.assign_id !== "") {
      formData.append("assign_id", String(params.assign_id));
    }
    formData.append("org_id", String(params.org_id));
    formData.append("name", params.name);
    formData.append("subject_name", params.subject_name);
    formData.append("end_time", String(params.end_time));
    formData.append("max_size", String(params.max_size));
    formData.append("status", String(params.status));
    formData.append("priority", String(params.priority));
    formData.append("file_type", params.file_type);
    formData.append("description", params.description);

    const response = await http.postForm<CreateOrganizationAssignmentResponse>("/organization/assignment_create", formData);
    return response.data;
  }

  static async getOrganizationAssignments(params: OrganizationAssignmentListItem): Promise<OrganizationAssignmentListResponse> {
    let url = `/organization/assignment_list?org_id=${params.org_id}&page_num=${params.page_num}&page_size=${params.page_size}`;
    if (params.status != -1) {
      url += `&status=${params.status}`;
    }

    const response = await http.get<OrganizationAssignmentListResponse>(url);
    return response.data;
  }

  static async getUserAssignments(): Promise<GetUserAssignmentsResponse> {
    let url = `/user/assignment/list`;

    const response = await http.get<GetUserAssignmentsResponse>(url);
    return response.data;
  }

  static async getAssignmentDetail(params: GetAssignmentDetailParams): Promise<GetAssignmentDetailResponse> {
    let url = `/assignment/detail?id=${params.id}`;

    const response = await http.get<GetAssignmentDetailResponse>(url);
    return response.data;
  }

  /**
   * 获取管理端任务统计数据
   */
  static async getAdminAssignmentStats(): Promise<AssignmentStatsResponse> {
    const response = await http.get<AssignmentStatsResponse>("/assignment/admin/stats");
    return response.data;
  }

  static async getAssignmentSubmissions(params: GetAssignmentDetailParams): Promise<GetAssignmentSubmissionsResponse> {
    let url = `/assignment/submission/list?assign_id=${params.id}`;

    const response = await http.get<GetAssignmentSubmissionsResponse>(url);
    return response.data;
  }
}

export default AssignmentService;

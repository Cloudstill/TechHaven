import http from "../utils/http";

/**
 * 删除标签请求参数类型
 */
export interface DeleteLabelParams {
  ids: string; // 逗号分隔的标签id字符串
}

/**
 * 删除标签响应类型
 */
export interface DeleteLabelResponse {
  ids: Array<string | number>;
}

/**
 * 创建标签请求参数类型
 */
export interface CreateLabelParams {
  id?: string | number; // 可选的标签ID，用于更新时
  name: string;
  color: string;
  description?: string;
}

/**
 * 创建标签响应类型
 */
export interface CreateLabelResponse {
  id: string | number;
  name: string;
  color: string;
  desc: string;
  create_time: number;
}

/**
 * 查询标签请求参数类型
 */
export interface QueryLabelParams {
  ids?: string; // 逗号分隔的标签id字符串
  user_id?: string | number;
}

/**
 * 标签信息类型
 */
export interface LabelInfo {
  id: string | number;
  name: string;
  color: string;
  description?: string;
  create_time?: string;
  article_count?: number;
}

/**
 * 标签服务类
 * 专门处理标签相关操作
 */
export class LabelService {
  /**
   * 删除标签
   * @param params 删除参数
   * @returns 删除结果
   */
  static async deleteLabel(params: DeleteLabelParams): Promise<DeleteLabelResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", params.ids);
    const response = await http.postForm<DeleteLabelResponse>("/label/delete", formData);
    return response.data;
  }

  /**
   * 创建标签
   * @param params 标签创建参数
   * @returns 创建响应
   */
  static async createLabel(params: CreateLabelParams): Promise<CreateLabelResponse> {
    const formData = new URLSearchParams();
    if (params.id !== undefined && params.id !== null && params.id !== "") {
      formData.append("id", params.id.toString());
    }
    formData.append("name", params.name);
    formData.append("color", params.color);
    if (params.description) {
      formData.append("desc", params.description);
    }
    const response = await http.postForm<CreateLabelResponse>("/label/create", formData);
    return response.data;
  }

  /**
   * 查询标签详情
   * @param params 查询参数
   * @returns 标签详情列表
   */
  static async queryLabel(params: QueryLabelParams): Promise<LabelInfo[]> {
    let url = "/label/query?";
    if (params.ids) url += `ids=${params.ids}&`;
    if (params.user_id) url += `user_id=${params.user_id}`;

    const response = await http.get<LabelInfo[]>(url);
    return response.data;
  }
}

export default LabelService;

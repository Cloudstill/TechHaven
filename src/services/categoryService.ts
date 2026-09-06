import http from "../utils/http";

/**
 * 查询分类响应类型
 */
export interface CategoryInfo {
  id: any;
  name: any;
  color: string;
  total: number;
  list: Array<{
    id: string | number;
    name: string;
    url: string;
    color: string;
    icon: string;
    description: string;
    parent_id: string | number;
    status: number;
    article_count: number;
    view_count: number;
    create_time: number;
    update_time: number;
  }>;
}

/**
 * 删除分类请求参数类型
 */
export interface DeleteCategoryParams {
  ids: string; // 逗号分隔的分类id字符串
}

/**
 * 删除分类响应类型
 */
export interface DeleteCategoryResponse {
  ids: Array<string | number>;
}

/**
 * 创建分类请求参数类型
 */
export interface CreateCategoryParams {
  id?: string | number;
  name: string;
  url: string;
  color: string;
  icon: string;
  description?: string;
  parent_id?: string | number;
  status?: number;
}

/**
 * 创建分类响应类型
 */
export interface CreateCategoryResponse {
  id: string | number;
  name: string;
  color: string;
  parent_id: string | number;
}

/**
 * 分类服务类
 * 专门处理分类相关操作
 */
export class CategoryService {
  /**
   * 查询分类详情
   * @returns 分类详情列表
   */
  static async queryCategory(): Promise<CategoryInfo> {
    const url = "/category/admin/query";

    const response = await http.get<CategoryInfo>(url);
    return response.data;
  }

  /**
   * 删除分类
   * @param params 删除参数
   * @returns 删除结果
   */
  static async deleteCategory(params: DeleteCategoryParams): Promise<DeleteCategoryResponse> {
    const formData = new URLSearchParams();
    formData.append("ids", params.ids);
    const response = await http.postForm<DeleteCategoryResponse>("/category/admin/delete", formData);
    return response.data;
  }

  /**
   * 创建分类
   * @param params 分类创建参数
   * @returns 创建响应
   */
  static async createCategory(params: CreateCategoryParams): Promise<CreateCategoryResponse> {
    const formData = new URLSearchParams();
    if (params.id !== undefined && params.id !== null && params.id !== "") {
      formData.append("id", String(params.id));
    }
    formData.append("name", params.name);
    formData.append("color", params.color);
    formData.append("icon", params.icon);
    formData.append("url", params.url);
    if (params.description) {
      formData.append("desc", params.description);
    }
    if (params.status !== undefined) {
      formData.append("status", String(params.status));
    }
    if (params.parent_id !== undefined && params.parent_id !== null && params.parent_id !== "") {
      formData.append("parent_id", String(params.parent_id));
    }
    const response = await http.postForm<CreateCategoryResponse>("/category/admin/create", formData);
    return response.data;
  }
}

export default CategoryService;

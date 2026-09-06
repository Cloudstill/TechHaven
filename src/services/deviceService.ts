import http, { type HttpResponse } from "../utils/http";

/**
 * 登录设备信息
 * 对应后端 user_login_device 表记录
 */
export interface LoginDevice {
  id: number | string;
  device_id: string;
  device_name: string;
  platform: string;
  ip: string;
  is_current: boolean;
  login_time: number;
  last_active_time: number;
}

/**
 * 设备列表响应
 */
export interface LoginDeviceListResponse {
  list: LoginDevice[];
  total: number;
}

/**
 * 设备管理服务
 * 用于多设备登录的设备列表查询与下线
 */
export class DeviceService {
  /**
   * 获取当前用户的登录设备列表
   * is_current 标识当前请求所在设备
   */
  static async listDevices(): Promise<HttpResponse<LoginDeviceListResponse>> {
    return http.get<LoginDeviceListResponse>("/user/device/list");
  }

  /**
   * 下线指定设备（仅限本人）
   * @param deviceId 设备标识（对应列表中的 device_id）
   */
  static async kickDevice(deviceId: string): Promise<HttpResponse> {
    const formData = new URLSearchParams();
    formData.append("device_id", deviceId);
    return http.postForm("/user/device/kick", formData);
  }
}

export default DeviceService;

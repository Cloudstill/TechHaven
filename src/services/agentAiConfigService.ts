import { AuthService, type AiConfig, type AiConfigParams } from "./authService";
import { agentRequest } from "./agentRequest";

interface Asset extends AiConfig {
  id: number;
  is_default: boolean;
}

/** The form and runner select the same store. Only an explicit legacy-mode
 * response permits writing the old backend; auth/network failures never do. */
export class AgentAiConfigService {
  private readonly fetchImpl: typeof fetch;
  constructor(fetchImpl: typeof fetch = fetch.bind(globalThis)) {
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await agentRequest(this.fetchImpl, `/gateway/v1/ai-configs${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `AI 配置请求失败 (${response.status})`);
    if (data === null) throw new Error("Agent 配置服务返回了无效响应，请稍后重试");
    return data as T;
  }

  private async isLegacy(): Promise<boolean> {
    const mode = await this.request<{ storage: string }>("/mode");
    if (mode.storage !== "assets" && mode.storage !== "legacy") throw new Error("无法确认 AI 配置存储，请刷新重试");
    return mode.storage === "legacy";
  }

  private async editableAsset(): Promise<Asset | undefined> {
    const result = await this.request<{ configs: Asset[]; preference: number | null }>("");
    return result.configs.find((c) => c.id === result.preference) ?? result.configs.find((c) => c.is_default) ?? result.configs[0];
  }

  async getAiConfig(): Promise<AiConfig | null> {
    if (await this.isLegacy()) return AuthService.getAiConfig();
    return (await this.editableAsset()) ?? null;
  }

  async saveAiConfig(input: AiConfigParams): Promise<void> {
    if (await this.isLegacy()) return AuthService.saveAiConfig(input);
    const asset = await this.editableAsset();
    let id: number;
    if (asset) {
      // Blank key means preserve the stored secret, never replace it with a mask.
      const { api_key: _key, ...patch } = input;
      await this.request(`/${asset.id}`, "PATCH", {
        ...patch,
        ...(input.api_key ? { api_key: input.api_key } : {}),
        is_default: true,
        status: "active",
        model: input.model ?? null,
        reasoning_effort: input.reasoning_effort ?? null,
        max_tokens: input.max_tokens ?? null,
      });
      id = asset.id;
    } else {
      if (!input.api_key) throw new Error("请重新输入完整 API 密钥以创建 Agent 配置");
      const created = await this.request<Asset>("", "POST", { ...input, name: "个人默认配置", is_default: true });
      id = created.id;
    }
    await this.request("/preference", "PUT", { config_id: id, org_id: null });
  }
}

export const agentAiConfigService = new AgentAiConfigService();

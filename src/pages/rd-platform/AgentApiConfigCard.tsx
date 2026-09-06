import React, { useState, useEffect, useRef } from "react";
import { FaRobot, FaKey, FaGlobe, FaCogs } from "react-icons/fa";
import Input from "@/components/input/Input";
import CustomSelect from "@/components/customSelect/CustomSelect";
import type { SelectOption } from "@/types/index";
import { message } from "@/components/message/Message";
import { agentAiConfigService } from "@/services/agentAiConfigService";
import styles from "../personal/PersonalCenter.module.css";
import ErrorState from "@/components/errorState/ErrorState";

type ApiType = "openai" | "claude" | "glm";
type ServiceProvider = "openai" | "anthropic" | "zhipu" | "custom";
type ResponseType = "responses" | "chat_completions" | "messages";

interface ProviderPreset {
  type: ApiType;
  responseType: ResponseType;
  url: string;
  keyPlaceholder: string;
  defaultModel: string;
}

const PROVIDER_OPTIONS: SelectOption[] = [
  { id: "openai", name: "OpenAI", color: "#10a37f" },
  { id: "anthropic", name: "Anthropic", color: "#d97706" },
  { id: "zhipu", name: "智谱 AI", color: "#4a6cf7" },
  { id: "custom", name: "自定义兼容服务", color: "#64748b" },
];

const PROTOCOL_OPTIONS: SelectOption[] = [
  { id: "openai", name: "OpenAI 兼容协议", color: "#10a37f" },
  { id: "claude", name: "Anthropic 兼容协议", color: "#d97706" },
  { id: "glm", name: "智谱 GLM 兼容协议", color: "#4a6cf7" },
];

const RESPONSE_OPTIONS: Record<ApiType, SelectOption[]> = {
  openai: [
    { id: "responses", name: "Responses API (/responses)", color: "#10a37f" },
    { id: "chat_completions", name: "Chat Completions (/chat/completions)", color: "#0ea5e9" },
  ],
  claude: [{ id: "messages", name: "Messages API (/messages)", color: "#d97706" }],
  glm: [{ id: "chat_completions", name: "Chat Completions (/chat/completions)", color: "#4a6cf7" }],
};

const DEFAULTS: Record<ServiceProvider, ProviderPreset> = {
  openai: {
    type: "openai",
    responseType: "responses",
    url: "https://api.openai.com/v1/responses",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-4o",
  },
  anthropic: {
    type: "claude",
    responseType: "messages",
    url: "https://api.anthropic.com/v1/messages",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-6",
  },
  zhipu: {
    type: "glm",
    responseType: "chat_completions",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    keyPlaceholder: "xxx.xxxxxxxxxxxxxxxx",
    defaultModel: "glm-4.7-flash",
  },
  custom: {
    type: "openai",
    responseType: "chat_completions",
    url: "https://api.example.com/v1/chat/completions",
    keyPlaceholder: "请输入完整 API Key",
    defaultModel: "gpt-4o",
  },
};

const DEFAULT_PROVIDER_BY_TYPE: Record<ApiType, ServiceProvider> = {
  openai: "openai",
  claude: "anthropic",
  glm: "zhipu",
};

function defaultResponseType(type: ApiType): ResponseType {
  return type === "claude" ? "messages" : "chat_completions";
}

function inferProvider(type: ApiType, rawUrl: string): ServiceProvider {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (type === "openai" && host === "api.openai.com") return "openai";
    if (type === "claude" && host === "api.anthropic.com") return "anthropic";
    if (type === "glm" && host === "open.bigmodel.cn") return "zhipu";
  } catch {
    // URL 的具体错误由保存校验统一提示；这里仅用于兼容旧配置的 UI 推断。
  }
  return "custom";
}

function inferResponseType(type: ApiType, rawUrl: string): ResponseType {
  if (/\/responses\/?$/i.test(rawUrl)) return compatibleResponseType(type, "responses");
  if (/\/messages\/?$/i.test(rawUrl)) return compatibleResponseType(type, "messages");
  if (/\/chat\/completions\/?$/i.test(rawUrl)) return compatibleResponseType(type, "chat_completions");
  return defaultResponseType(type);
}

function compatibleResponseType(type: ApiType, value: unknown): ResponseType {
  if (type === "openai" && (value === "responses" || value === "chat_completions")) return value;
  if (type === "claude" && value === "messages") return value;
  if (type === "glm" && value === "chat_completions") return value;
  return defaultResponseType(type);
}

function replaceEndpointSuffix(raw: string, responseType: ResponseType): string {
  const suffix = responseType === "responses" ? "/responses" : responseType === "messages" ? "/messages" : "/chat/completions";
  return raw.replace(/\/(?:responses|messages|chat\/completions)\/?$/, suffix);
}

/**
 * 各协议在 dsh runtime 中落到的字段。
 * provider 经 TECHHAVEN_DSH_PROVIDER_* 映射为 dsh 的 provider route；
 * model / maxTokens 对应 dsh InitializeParams 同名参数；
 * 凭据与 base URL 以环境变量注入隔离子进程（Gateway 只注入这三项，不继承其他环境密钥）。
 * 见 services/techhaven-gateway/.env.example 与 src/aiConfig.ts。
 */
const DSH_FIELD: Record<ApiType, { key: string; baseUrl: string; provider: string }> = {
  openai: { key: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL", provider: "TECHHAVEN_DSH_PROVIDER_OPENAI" },
  claude: { key: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL", provider: "TECHHAVEN_DSH_PROVIDER_CLAUDE" },
  glm: { key: "ZHIPUAI_API_KEY", baseUrl: "ZHIPUAI_BASE_URL", provider: "TECHHAVEN_DSH_PROVIDER_GLM" },
};

/**
 * 与 Gateway `src/aiConfig.ts` 的失败关闭规则对齐：
 * 这些情况原本要到创建会话时才报 412，这里提前到表单拦截。
 */
function validateUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "接口地址必须是完整 URL（需包含 https:// 前缀）";
  }
  if (parsed.username || parsed.password) return "接口地址不能内嵌用户名或密码";
  if (parsed.search || parsed.hash) return "接口地址不能带查询参数或锚点";
  const host = parsed.hostname;
  const isLoopback = host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    return "Agent 运行要求 HTTPS 接口地址（本机回环地址除外）";
  }
  return null;
}

function validateApiKey(raw: string): string | null {
  if (raw.length > 8192) return "密钥长度超出合理范围（上限 8192 字符），请核对是否复制了多余内容";
  if (/[*•]/.test(raw)) return "请填入完整密钥：脱敏串（含 * 或 •）无法用于运行";
  if (!/^[\x21-\x7e]+$/.test(raw)) return "密钥只能包含可打印 ASCII 字符，不能含空格或换行";
  return null;
}

function validateMaxTokens(raw: string): string | null {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return "最大生成长度必须是正整数";
  if (parsed > 1_000_000) return "最大生成长度超出合理范围（上限 1000000）";
  return null;
}

function validateReasoningEffort(raw: string): string | null {
  if (!/^[\x21-\x7e]{1,64}$/.test(raw)) {
    return "推理档位必须是 1~64 个可见 ASCII 字符（常见：minimal / low / medium / high / max）";
  }
  return null;
}

const AgentApiConfigCard: React.FC = () => {
  const [provider, setProvider] = useState<ServiceProvider>("openai");
  const [apiType, setApiType] = useState<ApiType>("openai");
  const [responseType, setResponseType] = useState<ResponseType>("responses");
  const [url, setUrl] = useState(DEFAULTS.openai.url);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const maskedKeyRef = useRef("");
  const keyTouchedRef = useRef(false);
  // 保存从后端加载的原始配置，切类型时恢复
  const savedConfigRef = useRef<{
    type: ApiType;
    provider: ServiceProvider;
    response_type: ResponseType;
    url: string;
    api_key: string;
    model: string;
    reasoning_effort: string;
    max_tokens: string;
  } | null>(null);

  const current = DEFAULTS[provider];
  const dsh = DSH_FIELD[apiType];
  const responseOptions = RESPONSE_OPTIONS[apiType];

  const applyConfig = (config: {
    type: ApiType;
    provider: ServiceProvider;
    response_type: ResponseType;
    url: string;
    api_key: string;
    model: string;
    reasoning_effort: string;
    max_tokens: string;
  }) => {
    setProvider(config.provider);
    setApiType(config.type);
    setResponseType(config.response_type);
    setUrl(config.url);
    setApiKey(config.api_key);
    maskedKeyRef.current = config.api_key;
    setModel(config.model);
    setReasoningEffort(config.reasoning_effort);
    setMaxTokens(config.max_tokens);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    agentAiConfigService
      .getAiConfig()
      .then((config) => {
        if (!active) return;
        if (config) {
          const t: ApiType = config.type === "claude" || config.type === "glm" ? config.type : "openai";
          const p: ServiceProvider =
            config.provider === "openai" ||
            config.provider === "anthropic" ||
            config.provider === "zhipu" ||
            config.provider === "custom"
              ? config.provider
              : inferProvider(t, config.url || DEFAULTS[DEFAULT_PROVIDER_BY_TYPE[t]].url);
          const r = compatibleResponseType(t, config.response_type ?? inferResponseType(t, config.url || ""));
          const saved = {
            type: t,
            provider: p,
            response_type: r,
            url: config.url || DEFAULTS[p].url,
            api_key: config.api_key || "",
            model: config.model || "",
            reasoning_effort: config.reasoning_effort || "",
            max_tokens: config.max_tokens ? String(config.max_tokens) : "",
          };
          savedConfigRef.current = saved;
          applyConfig(saved);
        }
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Agent 配置服务暂时不可用");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const handleProviderChange = (nextProvider: ServiceProvider) => {
    const preset = DEFAULTS[nextProvider];
    setProvider(nextProvider);
    setApiType(preset.type);
    setResponseType(preset.responseType);
    setUrl(preset.url);
    setModel("");
  };

  const handleTypeChange = (type: ApiType) => {
    const nextResponseType = defaultResponseType(type);
    setApiType(type);
    setProvider("custom");
    setResponseType(nextResponseType);
    setUrl(replaceEndpointSuffix(url, nextResponseType));
    // key / model / max_tokens 保持不变，因为用户只有一个配置
  };

  const handleResponseTypeChange = (nextResponseType: ResponseType) => {
    setResponseType(nextResponseType);
    setUrl(replaceEndpointSuffix(url, nextResponseType));
  };

  const handleSave = async () => {
    // 与 Gateway 失败关闭规则对齐：这些错误原本要到创建会话时才以 412 暴露，这里提前拦截
    if (!url.trim()) {
      message.warn("请输入接口地址");
      return;
    }
    const urlError = validateUrl(url.trim());
    if (urlError) {
      message.warn(urlError);
      return;
    }
    if (keyTouchedRef.current && !apiKey.trim()) {
      // 用户改过但清空了字段：按「沿用已保存密钥」语义放行（提交空串即保留），提示而非拦截
      message.warn("已清空密钥输入：保存后将沿用已保存的密钥，如需更换请重新输入完整密钥");
    } else if (keyTouchedRef.current) {
      const keyError = validateApiKey(apiKey.trim());
      if (keyError) {
        message.warn(keyError);
        return;
      }
    } else if (!maskedKeyRef.current) {
      message.warn("请输入 API 密钥");
      return;
    }
    if (maxTokens.trim()) {
      const tokensError = validateMaxTokens(maxTokens.trim());
      if (tokensError) {
        message.warn(tokensError);
        return;
      }
    } else if (apiType === "claude") {
      message.warn("Claude 系列必须填写最大生成长度 (max_tokens)");
      return;
    }
    if (reasoningEffort.trim()) {
      const effortError = validateReasoningEffort(reasoningEffort.trim());
      if (effortError) {
        message.warn(effortError);
        return;
      }
    }

    setSaving(true);
    try {
      const keyToSend = keyTouchedRef.current ? apiKey.trim() : "";
      await agentAiConfigService.saveAiConfig({
        type: apiType,
        provider,
        response_type: responseType,
        url: url.trim(),
        api_key: keyToSend,
        model: model.trim() || undefined,
        reasoning_effort: reasoningEffort.trim() || undefined,
        max_tokens: maxTokens.trim() ? Number(maxTokens) : undefined,
      });
      // 更新本地缓存，防止切走再切回来时丢失刚保存的配置
      savedConfigRef.current = {
        type: apiType,
        provider,
        response_type: responseType,
        url: url.trim(),
        api_key: keyToSend,
        model: model.trim(),
        reasoning_effort: reasoningEffort.trim(),
        max_tokens: maxTokens.trim(),
      };
      if (keyTouchedRef.current) {
        maskedKeyRef.current = apiKey.trim();
      }
      keyTouchedRef.current = false;
      message.success("配置已保存");
    } catch (err: any) {
      message.error(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p role="status">正在加载 Agent 配置…</p>;
  if (loadError)
    return (
      <ErrorState title="Agent 配置暂时不可用" message={loadError} actionText="重试" onAction={() => setRetry((value) => value + 1)} />
    );

  return (
    <div className={styles.editCard}>
      <div className={styles.editCardHeader}>
        <FaRobot className={styles.editCardIcon} />
        <span>AI 接口配置</span>
      </div>
      <div className={styles.editCardBody}>
        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>服务商</label>
          <CustomSelect
            name="服务商"
            options={PROVIDER_OPTIONS}
            value={PROVIDER_OPTIONS.find((o) => o.id === provider) || null}
            onChange={(option) => {
              if (option) handleProviderChange(option.id as ServiceProvider);
            }}
            hideBadge
            placeholder="请选择服务商..."
          />
          <span className={styles.editHint}>
            选择服务商会带入推荐的协议、接口类型和地址；中转、私有部署或其他兼容服务请选择“自定义兼容服务”
          </span>
        </div>

        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>协议类型</label>
          <CustomSelect
            name="协议类型"
            options={PROTOCOL_OPTIONS}
            value={PROTOCOL_OPTIONS.find((o) => o.id === apiType) || null}
            onChange={(option) => {
              if (option) handleTypeChange(option.id as ApiType);
            }}
            hideBadge
            placeholder="请选择协议类型..."
          />
          <span className={styles.editHint}>
            决定鉴权环境变量和 dsh provider route；手动切换协议后，服务商会变为“自定义兼容服务”（经{" "}
            <span className={styles.editHintCode}>{dsh.provider}</span> 映射）
          </span>
        </div>

        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>接口类型</label>
          <CustomSelect
            name="接口类型"
            options={responseOptions}
            value={responseOptions.find((o) => o.id === responseType) || null}
            onChange={(option) => {
              if (option) handleResponseTypeChange(option.id as ResponseType);
            }}
            hideBadge
            placeholder="请选择接口类型..."
          />
          <span className={styles.editHint}>
            Responses API 使用 <span className={styles.editHintCode}>POST /responses</span>；Chat Completions 使用{" "}
            <span className={styles.editHintCode}>POST /chat/completions</span>；Anthropic Messages 使用{" "}
            <span className={styles.editHintCode}>POST /messages</span>。实际可用范围取决于模型和部署的 dsh provider route
          </span>
        </div>

        {/* 第二步：通用配置 */}
        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>
            <FaGlobe size={12} style={{ marginRight: 4 }} />
            接口地址 (URL)
          </label>
          <Input value={url} onChange={(v) => setUrl(v)} placeholder={current.url} size="large" />
          <span className={styles.editHint}>
            填写完整资源地址，也可使用中转/代理地址。将作为 dsh 环境变量 <span className={styles.editHintCode}>{dsh.baseUrl}</span>{" "}
            注入，Gateway 会按所选接口类型剥离末尾的 /responses、/chat/completions 或 /messages
          </span>
        </div>

        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>
            <FaKey size={12} style={{ marginRight: 4 }} />
            API 密钥 (Key)
          </label>
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={8192}
            value={apiKey}
            onChange={(v) => {
              setApiKey(v);
              keyTouchedRef.current = true;
            }}
            placeholder={current.keyPlaceholder}
            size="large"
          />
          <span className={styles.editHint}>
            {maskedKeyRef.current ? "已保存密钥（脱敏显示），如需修改请重新输入" : "密钥加密存储，仅你可见"}。将作为 dsh 环境变量{" "}
            <span className={styles.editHintCode}>{dsh.key}</span> 注入会话专属子进程，不进入浏览器存储，也不会出现在会话视图或日志中
          </span>
        </div>

        {/* 第三步：附加配置 */}
        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>
            <FaCogs size={12} style={{ marginRight: 4 }} />
            模型名称 (Model)
          </label>
          <Input value={model} onChange={(v) => setModel(v)} placeholder={`如 ${current.defaultModel}`} maxLength={256} size="large" />
          <span className={styles.editHint}>
            对应 dsh 的 model 参数。留空则使用默认模型 {current.defaultModel}，也可输入其他模型名
          </span>
        </div>

        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>推理档位 (Reasoning Effort)</label>
          <Input
            value={reasoningEffort}
            onChange={(v) => setReasoningEffort(v)}
            placeholder="选填，如 medium / high / max"
            maxLength={64}
            size="large"
          />
          <span className={styles.editHint}>
            对应 dsh 的 reasoningEffort 参数。常见值：minimal / low / medium / high / max（具体支持范围取决于模型）；留空使用模型默认
          </span>
        </div>

        <div className={styles.editFormGroup}>
          <label className={styles.editLabel}>
            最大生成长度 (max_tokens)
            {apiType === "claude" && <span style={{ color: "#ef4444", marginLeft: 4 }}>*必填</span>}
            {(apiType === "openai" || apiType === "glm") && (
              <span style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>(选填)</span>
            )}
          </label>
          <Input
            type="number"
            value={maxTokens}
            onChange={(v) => setMaxTokens(v)}
            placeholder={apiType === "claude" ? "必填，如 4096" : "选填，如 2048"}
            size="large"
          />
          <span className={styles.editHint}>
            {apiType === "claude" ? "Claude API 要求必须指定 max_tokens，建议不超过 4096" : "可选，留空使用模型默认值"}
            。对应 dsh 的 maxTokens 参数
          </span>
        </div>

        <button className={styles.editSaveBtn} onClick={handleSave} disabled={saving}>
          <FaKey />
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  );
};

export default AgentApiConfigCard;

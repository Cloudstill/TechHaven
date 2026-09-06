/** Bound ordinary Agent HTTP calls; SSE has its own reconnection lifecycle. */
export async function agentRequest(fetcher: typeof fetch, input: string, init?: RequestInit): Promise<Response> {
  const response = await fetcher(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) }).catch(() => {
    throw new Error("Agent 服务暂时不可用或连接超时，请稍后重试。其他页面仍可正常使用。");
  });
  if (response.status >= 500) {
    throw new Error("Agent 服务暂时不可用，请稍后重试。其他页面仍可正常使用。");
  }
  return response;
}

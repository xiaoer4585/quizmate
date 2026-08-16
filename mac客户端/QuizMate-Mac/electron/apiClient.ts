// 后端统一 RPC 客户端 —— 复用原 QuizMate 客户端的 action 协议
// 单端点 POST {apiBaseUrl}，请求体 { action, ...params }，响应 { ok, data } | { ok:false, code, error }
import { app } from 'electron';

export type ApiErrorKind = 'auth' | 'credits' | 'timeout' | 'network' | 'response';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  kind: ApiErrorKind;
  constructor(message: string, code = 'RESPONSE_ERROR', statusCode = 500, kind: ApiErrorKind = 'response') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

export interface ActionEnvelope<T = unknown> {
  data: T;
  envelope: { ok: boolean; data: T; creditBalance?: number; [k: string]: unknown };
}

export interface PostActionOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  token?: string;
}

/** POST 一个 action，返回完整信封（含 creditBalance 等顶层字段） */
export async function postActionEnvelope<T = any>(
  endpoint: string,
  action: string,
  input: Record<string, unknown> = {},
  options: PostActionOptions = {}
): Promise<ActionEnvelope<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 60000);
  const onParentAbort = () => controller.abort((options.signal?.reason as any) || 'parent-abort');
  options.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    const body: Record<string, unknown> = { action, ...input };
    if (options.token) body.accountToken = options.token;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Client-Version': app.getVersion(),
        'X-Client-Platform': 'darwin-desktop',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const envelope = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || envelope.ok !== true || envelope.data === undefined) {
      const message =
        typeof envelope.error === 'string' && envelope.error ? envelope.error : `请求失败（${response.status}）`;
      const code = envelope.code || 'RESPONSE_ERROR';
      console.error(`[apiClient] ${action} failed: HTTP ${response.status}`, {
        ok: envelope.ok,
        code: envelope.code,
        error: envelope.error,
      });
      const kind: ApiErrorKind = /登录|令牌|token|失效|SESSION_EXPIRED|AUTH_REQUIRED/.test(message + code)
        ? 'auth'
        : /积分不足|INSUFFICIENT_CREDITS/.test(message + code)
          ? 'credits'
          : 'response';
      throw new ApiError(message, code, response.status, kind);
    }
    return { data: envelope.data as T, envelope };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      const message = options.signal?.aborted ? '已取消请求。' : '请求超时，请稍后重试。';
      throw new ApiError(message, 'TIMEOUT', 408, 'timeout');
    }
    throw new ApiError('网络连接失败，请检查网络后重试。', 'NETWORK_ERROR', 0, 'network');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onParentAbort);
  }
}

/** POST 一个 action，仅返回 data */
export async function postAction<T = any>(
  endpoint: string,
  action: string,
  input: Record<string, unknown> = {},
  options: PostActionOptions = {}
): Promise<T> {
  const { data } = await postActionEnvelope<T>(endpoint, action, input, options);
  return data;
}

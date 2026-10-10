import { ApiError } from '@/shared/errors/api-error'
import { createUuid } from '@/shared/utils/create-uuid'

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export interface ApiRequestOptions {
  body?: unknown
  headers?: HeadersInit
  idempotencyKey?: string
  method: HttpMethod
  path: string
  query?: Readonly<Record<string, boolean | number | string | null | undefined>>
  signal?: AbortSignal
}

export interface ApiClient {
  request<T>(options: ApiRequestOptions): Promise<T>
}

export interface ApiClientOptions {
  baseUrl?: string
  fetchImplementation?: typeof fetch
  getCsrfToken?: () => string | null | undefined
  onUnauthorized?: () => void
}

interface ApiErrorPayload {
  code?: unknown
  details?: unknown
  message?: unknown
  request_id?: unknown
}

const genericMessages: Readonly<Record<number, string>> = {
  401: '登录状态已失效，请重新登录',
  403: '当前账号无权执行此操作',
  409: '数据状态已变化，请刷新后重试',
  422: '提交内容不正确，请检查后重试',
  429: '操作过于频繁，请稍后重试'
}

/**
 * 生成用于前后端日志关联的请求标识
 *
 * @returns 以 web 为前缀的唯一请求标识
 */
export function createRequestId(): string {
  return `web-${createUuid()}`
}

/**
 * 生成写命令使用的幂等键
 *
 * @returns 以 idem 为前缀的唯一幂等键
 */
export function createIdempotencyKey(): string {
  return `idem-${createUuid()}`
}

/**
 * 创建统一封装认证、追踪头与错误映射的 API 客户端
 *
 * @param options - API 根地址、认证回调和可替换的 fetch 实现
 * @returns 可执行类型化请求的 API 客户端
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl?.replace(/\/$/, '') ?? ''
  const fetchImplementation = options.fetchImplementation ?? fetch

  /**
   * 执行单次 API 请求并将非成功响应转换为统一错误
   *
   * @param requestOptions - 请求方法、路径、参数和可选取消信号
   * @returns 接口返回的类型化响应体
   */
  async function request<T>(requestOptions: ApiRequestOptions): Promise<T> {
    const requestId = createRequestId()
    const headers = new Headers(requestOptions.headers)
    const isWriteRequest = requestOptions.method !== 'GET'

    headers.set('Accept', 'application/json')
    headers.set('X-Request-ID', requestId)

    if (isWriteRequest) {
      const csrfToken = options.getCsrfToken?.()
      if (options.getCsrfToken && !csrfToken) {
        options.onUnauthorized?.()
        throw new ApiError({
          code: 'CSRF_TOKEN_MISSING',
          message: '安全凭证已失效，请重新登录',
          requestId,
          status: 401
        })
      }
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
      if (requestOptions.idempotencyKey) {
        headers.set('X-Idempotency-Key', requestOptions.idempotencyKey)
      }
    }

    const body = createRequestBody(requestOptions.body, headers)
    const response = await fetchImplementation(
      createRequestUrl(baseUrl, requestOptions.path, requestOptions.query),
      {
        body,
        credentials: 'include',
        headers,
        method: requestOptions.method,
        signal: requestOptions.signal
      }
    )

    if (response.ok) return readSuccessBody<T>(response)

    if (response.status === 401) options.onUnauthorized?.()
    throw await createApiError(response, requestId)
  }

  return { request }
}

/**
 * 创建包含查询参数的完整请求地址
 *
 * @param baseUrl - 去除尾部斜杠后的 API 根地址
 * @param path - 以斜杠开头的接口路径
 * @param query - 可选查询参数对象
 * @returns 拼接后的请求地址
 */
function createRequestUrl(
  baseUrl: string,
  path: string,
  query?: ApiRequestOptions['query']
): string {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) search.set(key, String(value))
  }

  const queryString = search.toString()
  return queryString ? `${url}?${queryString}` : url
}

/**
 * 将业务请求体转换为 fetch 可接受的格式并补充内容类型
 *
 * @param value - 调用方提供的请求体
 * @param headers - 即将发送的请求头集合
 * @returns 可交给 fetch 的请求体，未提供时返回 undefined
 */
function createRequestBody(value: unknown, headers: Headers): BodyInit | undefined {
  if (value === undefined) return undefined
  if (value instanceof Blob || value instanceof FormData || typeof value === 'string') return value

  headers.set('Content-Type', 'application/json')
  return JSON.stringify(value)
}

/**
 * 读取成功响应，兼容无响应体的 204 命令
 *
 * @param response - fetch 返回的成功响应
 * @returns 解析后的类型化响应体
 */
async function readSuccessBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (text.length === 0) return undefined as T
  const contentType = response.headers.get('Content-Type') ?? ''
  const trimmedText = text.trimStart()
  const looksLikeJson = trimmedText.startsWith('{') || trimmedText.startsWith('[')
  return (contentType.includes('application/json') || looksLikeJson ? JSON.parse(text) : text) as T
}

/**
 * 将失败响应转换为不泄漏内部细节的统一错误
 *
 * @param response - fetch 返回的失败响应
 * @param clientRequestId - 客户端生成的兜底请求标识
 * @returns 带状态码、错误码和追踪标识的接口错误
 */
async function createApiError(response: Response, clientRequestId: string): Promise<ApiError> {
  const payload = await readErrorPayload(response)
  const hasServerRequestId = typeof payload.request_id === 'string' && payload.request_id.length > 0
  const requestId = hasServerRequestId ? (payload.request_id as string) : clientRequestId
  const defaultMessage = genericMessages[response.status] ?? '服务暂时不可用，请稍后重试'
  const message =
    hasServerRequestId && typeof payload.message === 'string' ? payload.message : defaultMessage
  const details = isRecord(payload.details) ? { ...payload.details } : {}
  const retryAfter = response.headers.get('Retry-After')
  if (response.status === 429 && retryAfter && details.retry_after_seconds === undefined) {
    const seconds = /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000))
    if (Number.isFinite(seconds)) details.retry_after_seconds = seconds
  }

  return new ApiError({
    code: typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
    details,
    message,
    requestId,
    status: response.status
  })
}

/**
 * 安全解析错误响应体，非 JSON 内容按空对象处理
 *
 * @param response - fetch 返回的失败响应
 * @returns 可选字段组成的错误载荷
 */
async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload
  } catch {
    return {}
  }
}

/**
 * 判断未知值是否为可安全展开的普通记录
 *
 * @param value - 需要判断的未知值
 * @returns 值是否为非空对象且不是数组
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import type { components } from '@/shared/contracts/generated/admin-api'
import type { UploadProgress } from '@/shared/types/media'

/** 保存服务端安全错误与未知请求状态 */
export class ApiError extends Error {
  /** 创建安全业务错误
   * @param code 错误标识
   * @param message 用户可见说明
   * @param status HTTP 状态
   * @param details 发布资料核对问题
   */
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public details: { field?: string; message?: string }[] = []
  ) {
    super(message)
  }
}

/** 创建独立管理会话请求端
 * @param baseUrl 管理 API 地址
 * @param transport HTTP 发送端口
 * @param onExpired 认证失效回调
 * @param xhrFactory 上传网络端口
 * @returns 管理请求与会话操作
 */
export const createHttpClient = (
  baseUrl: string,
  transport: typeof fetch = fetch,
  onExpired: () => void = () => {},
  xhrFactory: () => XMLHttpRequest = () => new XMLHttpRequest()
) => {
  let csrf = ''
  /** 发送经认证的请求并保留真实失败
   * @param path 接口地址
   * @param options 方法、正文和稳定操作键
   * @param options.method HTTP 方法
   * @param options.body 提交正文
   * @param options.key 稳定操作标识
   * @param options.signal 取消控制
   * @returns 已提交的服务端响应
   */
  const request = async <T>(
    path: string,
    options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}
  ): Promise<T> => {
    const method = options.method || 'GET'
    const headers = new Headers()
    if (!['GET', 'HEAD'].includes(method)) {
      headers.set('X-CSRF-Token', csrf)
      headers.set('Idempotency-Key', options.key || crypto.randomUUID())
    }
    const isForm = options.body instanceof FormData
    if (options.body !== undefined && !isForm) headers.set('Content-Type', 'application/json')
    let response: Response
    try {
      response = await transport(
        new Request(new URL(path, baseUrl || location.origin), {
          method,
          headers,
          credentials: 'include',
          signal: options.signal,
          body:
            options.body === undefined
              ? undefined
              : isForm
                ? (options.body as FormData)
                : JSON.stringify(options.body)
        })
      )
    } catch {
      throw new ApiError('network_unknown', '网络连接中断，请重试以确认结果')
    }
    if (response.status === 401) {
      csrf = ''
      onExpired()
    }
    let result
    try {
      result = await response.json()
    } catch {
      throw new ApiError(
        response.ok ? 'response_unknown' : 'request_failed',
        response.ok ? '请求结果暂未确认，请重试以恢复结果' : '请求失败，请稍后重试',
        response.status
      )
    }
    if (!response.ok) {
      throw new ApiError(
        result.error?.code || 'request_failed',
        result.error?.message || '请求失败，请重试',
        response.status,
        result.error?.details || []
      )
    }
    return result as T
  }
  /** 从 Cookie 恢复会话与 CSRF
   * @returns 当前管理员及会话校验
   */
  const resume = async () => {
    const result = await request<components['schemas']['AdminSessionResponse']>(
      '/api/admin/v1/auth/session'
    )
    csrf = result.csrf_token
    return result
  }
  /** 主动登录管理后台
   * @param body 管理员账号密码
   * @returns 管理员身份
   */
  const login = async (body: components['schemas']['AdminLogin']) => {
    const result = await request<components['schemas']['AdminLoginResponse']>(
      '/api/admin/v1/auth/login',
      { method: 'POST', body }
    )
    csrf = result.csrf_token
    return result.administrator
  }
  /** 冻结一次写操作，未知响应可用同一标识重试
   * @param method 写方法
   * @param path 业务路径
   * @param body 固定提交正文
   * @returns 可重试操作
   */
  const operation = <T>(method: string, path: string, body?: unknown) => {
    const key = crypto.randomUUID()
    const frozen =
      body instanceof FormData ? body : body === undefined ? undefined : structuredClone(body)
    return () => request<T>(path, { method, body: frozen, key })
  }
  /** 上传文件并报告真实传输进度，服务端处理阶段由状态接口确认
   * @param path 上传路径
   * @param form 已选择文件表单
   * @param key 本次上传的固定幂等键
   * @param onProgress 字节进度回调
   * @param signal 取消本次传输，取消后仍可用原键查询接收结果
   * @returns 素材处理状态
   */
  const upload = <T>(
    path: string,
    form: FormData,
    key: string,
    onProgress: (progress: UploadProgress) => void,
    signal?: AbortSignal
  ): Promise<T> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ApiError('upload_unknown', '传输已取消，接收结果待确认'))
        return
      }
      const xhr = xhrFactory()
      /** 请求结束后移除取消监听 */
      const clean = () => {
        signal?.removeEventListener('abort', cancel)
      }
      /** 只停止本次传输，已接收的服务端任务继续保留 */
      const cancel = () => {
        xhr.abort()
      }
      xhr.onabort = () => {
        clean()
        reject(new ApiError('upload_unknown', '传输已取消，接收结果待确认；可查询或重试同一文件'))
      }
      signal?.addEventListener('abort', cancel, { once: true })
      xhr.open('POST', new URL(path, baseUrl || location.origin).toString())
      xhr.withCredentials = true
      xhr.timeout = 120000
      xhr.setRequestHeader('X-CSRF-Token', csrf)
      xhr.setRequestHeader('Idempotency-Key', key)
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable && event.total > 0 ? event.total : null
        onProgress({
          loaded: event.loaded,
          total,
          percent: total === null ? null : Math.min(100, Math.floor((event.loaded / total) * 100))
        })
      }
      xhr.onerror = xhr.ontimeout = () => {
        clean()
        reject(new ApiError('network_unknown', '上传响应未知，请重试以确认结果'))
      }
      xhr.onload = () => {
        clean()
        let result
        try {
          result = JSON.parse(xhr.responseText)
        } catch {
          reject(
            new ApiError(
              xhr.status >= 200 && xhr.status < 300 ? 'response_unknown' : 'upload_failed',
              '上传接收结果待确认，请查询或重试同一文件',
              xhr.status
            )
          )
          return
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(result as T)
          return
        }
        if (xhr.status === 401) {
          csrf = ''
          onExpired()
        }
        reject(
          new ApiError(
            result.error?.code || 'upload_failed',
            result.error?.message || '上传失败，请重试',
            xhr.status
          )
        )
      }
      xhr.send(form)
    })
  return { request, resume, login, operation, upload }
}
export const api = createHttpClient(import.meta.env.VITE_API_BASE_URL || '', fetch, () =>
  window.dispatchEvent(new Event('admin-session-expired'))
)

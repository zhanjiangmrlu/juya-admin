export interface ApiErrorOptions {
  code: string
  details?: Readonly<Record<string, unknown>>
  message: string
  requestId: string
  status: number
}

export class ApiError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, unknown>>
  readonly requestId: string
  readonly status: number

  /**
   * 创建包含 HTTP 状态与请求追踪信息的统一接口错误。
   *
   * @param options - 服务端错误与客户端补全的安全错误信息。
   */
  constructor(options: ApiErrorOptions) {
    super(options.message)
    this.name = 'ApiError'
    this.code = options.code
    this.details = options.details ?? {}
    this.requestId = options.requestId
    this.status = options.status
  }
}

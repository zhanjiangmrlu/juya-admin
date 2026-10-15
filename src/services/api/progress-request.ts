import type { ApiRequestOptions } from './api-client'

/**
 * 发送带进度的认证表单请求，响应继续交给共用解析层
 * @param url - 当前接口完整地址
 * @param options - 文件表单、进度回调及取消信号
 * @param headers - 共用客户端已经补齐的认证与追踪头
 * @param factory - 浏览器上传传输的创建方法
 * @returns 当前操作结果或完成状态
 */
export const progressRequest = (
  url: string,
  options: ApiRequestOptions,
  headers: Headers,
  factory: () => XMLHttpRequest
): Promise<Response> =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('上传已取消', 'AbortError'))
      return
    }
    if (!(options.body instanceof FormData)) {
      reject(new TypeError('上传进度仅适用于文件表单'))
      return
    }
    const xhr = factory()
    let settled = false
    /**
     * 中止当前传输，保持客户端取消语义
     * @returns 当前操作结果或完成状态
     */
    const abort = (): void => xhr.abort()
    /**
     * 结束传输并释放监听，failure 为浏览器错误，response 为实际 HTTP 响应
     * @param failure - 浏览器返回的传输错误
     * @param response - 实际 HTTP 响应
     * @returns 当前操作结果或完成状态
     */
    const finish = (failure?: Error, response?: Response): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      xhr.upload.onprogress = null
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null
      if (failure) reject(failure)
      else if (response) resolve(response)
    }
    xhr.open(options.method, url)
    xhr.withCredentials = true
    xhr.responseType = 'arraybuffer'
    headers.forEach((value, key) => xhr.setRequestHeader(key, value))
    xhr.upload.onprogress = (event): void => {
      options.onUploadProgress?.(
        event.lengthComputable && event.total > 0
          ? event.loaded >= event.total
            ? 100
            : Math.min(99, Math.max(0, Math.round((event.loaded / event.total) * 100)))
          : null
      )
    }
    xhr.onerror = (): void => finish(new TypeError('网络连接失败，请重试本次文件'))
    xhr.ontimeout = (): void => finish(new TypeError('上传连接超时，请重试本次文件'))
    xhr.onabort = (): void => finish(new DOMException('上传已取消', 'AbortError'))
    xhr.onload = (): void => {
      try {
        const responseHeaders = new Headers()
        for (const line of xhr
          .getAllResponseHeaders()
          .trim()
          .split(/[\r\n]+/)) {
          const colon = line.indexOf(':')
          if (colon > 0) responseHeaders.append(line.slice(0, colon), line.slice(colon + 1).trim())
        }
        finish(
          undefined,
          new Response([204, 205, 304].includes(xhr.status) ? null : xhr.response, {
            status: xhr.status,
            headers: responseHeaders
          })
        )
      } catch (failure) {
        finish(failure instanceof Error ? failure : new Error('上传响应无效'))
      }
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      xhr.send(options.body)
    } catch (failure) {
      finish(failure instanceof Error ? failure : new Error('上传请求失败'))
    }
  })

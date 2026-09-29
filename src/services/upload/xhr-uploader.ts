export interface XhrUploadInput {
  fields: Readonly<Record<string, string>>
  file: File
  onProgress: (progress: number) => void
  signal: AbortSignal
  url: string
}

export interface XhrUploader {
  upload(input: XhrUploadInput): Promise<void>
}

export type XhrFactory = () => XMLHttpRequest

/**
 * 创建支持进度和取消的 XMLHttpRequest 上传器
 *
 * @param xhrFactory - 可替换的 XMLHttpRequest 工厂
 * @returns 文件上传器
 */
export function createXhrUploader(
  xhrFactory: XhrFactory = () => new XMLHttpRequest()
): XhrUploader {
  return {
    /**
     * 将文件和临时字段直传对象存储
     *
     * @param input - 上传地址、表单字段、文件和生命周期回调
     * @returns 上传完成后的 Promise
     */
    upload(input) {
      return new Promise<void>((resolve, reject) => {
        const xhr = xhrFactory()
        const form = new FormData()
        for (const [key, value] of Object.entries(input.fields)) form.append(key, value)
        form.append('file', input.file)
        xhr.open('POST', input.url)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            input.onProgress(
              Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)))
            )
        }
        xhr.onerror = () => reject(new Error('对象存储上传失败'))
        xhr.onabort = () => reject(new DOMException('上传已取消', 'AbortError'))
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`对象存储上传失败：${xhr.status}`))
        }
        input.signal.addEventListener('abort', () => xhr.abort(), { once: true })
        xhr.send(form)
      })
    }
  }
}

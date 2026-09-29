import { readonly, ref } from 'vue'

import type { DeepReadonly, Ref } from 'vue'

export interface UploadPreparation {
  fields: Readonly<Record<string, string>>
  objectKey: string
  url: string
}

export interface UploadAdapter {
  confirm(prepared: UploadPreparation): Promise<void>
  prepare(file: File): Promise<UploadPreparation>
  upload(
    prepared: UploadPreparation,
    file: File,
    onProgress: (progress: number) => void,
    signal: AbortSignal
  ): Promise<void>
}

export type UploadStatus =
  'awaiting-ocr' | 'cancelled' | 'failed' | 'preparing' | 'queued' | 'uploading'

export interface UploadQueueItem {
  error: string | null
  file: File
  id: string
  progress: number
  status: UploadStatus
}

export interface UploadQueueController {
  add(file: File): UploadQueueItem
  cancel(id: string): void
  items: DeepReadonly<Ref<UploadQueueItem[]>>
  start(id: string): Promise<void>
  startAll(): Promise<void>
}

/**
 * 创建相互隔离的图片上传队列
 *
 * @param adapter - 上传准备、直传和确认适配器
 * @returns 上传队列控制器
 */
export function useUploadQueue(adapter: UploadAdapter): UploadQueueController {
  const items = ref<UploadQueueItem[]>([])
  const abortControllers = new Map<string, AbortController>()

  /**
   * 向队列加入一张图片
   *
   * @param file - 待上传图片
   * @returns 新建的队列项
   */
  function add(file: File): UploadQueueItem {
    const item: UploadQueueItem = {
      error: null,
      file,
      id: crypto.randomUUID(),
      progress: 0,
      status: 'queued'
    }
    items.value.push(item)
    return item
  }

  /**
   * 取消指定队列项
   *
   * @param id - 队列项编号
   * @returns 无返回值
   */
  function cancel(id: string): void {
    abortControllers.get(id)?.abort()
    const item = items.value.find((candidate) => candidate.id === id)
    if (item && item.status !== 'awaiting-ocr') item.status = 'cancelled'
  }

  /**
   * 执行单个队列项的准备、直传和确认流程
   *
   * @param id - 队列项编号
   * @returns 单项流程完成后的 Promise
   */
  async function start(id: string): Promise<void> {
    const item = items.value.find((candidate) => candidate.id === id)
    if (!item || item.status === 'awaiting-ocr') return
    const controller = new AbortController()
    abortControllers.set(id, controller)
    item.error = null
    item.status = 'preparing'
    try {
      const prepared = await adapter.prepare(item.file)
      if (controller.signal.aborted) return
      item.status = 'uploading'
      await adapter.upload(
        prepared,
        item.file,
        (progress) => {
          item.progress = Math.min(100, Math.max(0, progress))
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      await adapter.confirm(prepared)
      if (controller.signal.aborted) return
      item.progress = 100
      item.status = 'awaiting-ocr'
    } catch (failure) {
      if (!controller.signal.aborted) {
        item.error = failure instanceof Error ? failure.message : '上传失败'
        item.status = 'failed'
      }
    } finally {
      abortControllers.delete(id)
    }
  }

  /**
   * 并行启动所有排队或失败项
   *
   * @returns 全部可启动项结束后的 Promise
   */
  async function startAll(): Promise<void> {
    await Promise.allSettled(
      items.value
        .filter((item) => item.status === 'queued' || item.status === 'failed')
        .map((item) => start(item.id))
    )
  }

  return { add, cancel, items: readonly(items), start, startAll }
}

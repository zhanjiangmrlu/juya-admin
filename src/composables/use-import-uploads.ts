import { computed, onBeforeUnmount, ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportFile, ImportUpload } from '@/shared/types/import'

/** 管理同批资料的串行上传与未知接收结果，成功文件不会再次进入队列
 * @param batchId 当前资料所属批次
 * @param limit 按资料用途读取当前环境的单文件上限
 * @param refresh 文件接收后获取服务器状态
 * @returns 可追加和移除的本地队列及上传操作
 */
export const useImportUploads = (
  batchId: () => string,
  limit: (kind: ImportUpload['kind']) => number,
  refresh: () => void
) => {
  const uploads = ref<ImportUpload[]>([])
  const running = ref(false)
  const controllers = new Map<string, AbortController>()
  const transferring = computed(() => uploads.value.some((item) => item.busy))
  const pendingCount = computed(
    () => uploads.value.filter((item) => item.queued || (item.unknown && !item.cancelled)).length
  )
  let alive = true
  /** 接收同一文件，网络结果未知时先查询原操作凭证
   * @param item 含稳定操作键的独立上传记录
   */
  const send = async (item: ImportUpload) => {
    item.queued = false
    item.busy = true
    item.error = ''
    const controller = new AbortController()
    controllers.set(item.id, controller)
    try {
      if (item.unknown) {
        try {
          const receipt = await api.request<components['schemas']['OperationResponse']>(
            `/api/admin/v1/operations/${item.key}`
          )
          item.accepted = receipt.result as ImportFile
          item.unknown = false
        } catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
          if (item.cancelled) {
            item.error = '传输已取消，接收结果待确认；尚无回执，可稍后再次查询'
            return
          }
        }
      }
      if (controller.signal.aborted && !item.accepted)
        throw new ApiError('upload_unknown', '传输已取消，请查询接收结果')
      if (!item.accepted) {
        const form = new FormData()
        form.append('file', item.file)
        item.accepted = await api.upload<ImportFile>(
          `/api/admin/v1/imports/${batchId()}/files?kind=${item.kind}`,
          form,
          item.key,
          (progress) => {
            item.progress = progress
            item.percent = progress.percent
          },
          controller.signal
        )
      }
      item.unknown = false
      if (alive) refresh()
    } catch (reason) {
      item.unknown =
        !(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        reason.code === 'response_unknown'
      if (alive) item.error = reason instanceof Error ? reason.message : '上传失败，请重试本文件'
    } finally {
      controllers.delete(item.id)
      item.busy = false
    }
  }
  /** 逐个处理当前及处理中追加的资料，失败文件等待明确重试 */
  const start = async () => {
    if (running.value) return
    running.value = true
    try {
      while (alive) {
        const next = uploads.value.find((item) => item.queued)
        if (!next) break
        await send(next)
      }
    } finally {
      running.value = false
    }
  }
  /** 全部选择先入队；校验失败只影响当前文件
   * @param files 管理员本次选择的本地文件
   * @param kind 资料的明确用途
   */
  const add = (files: File[], kind: ImportUpload['kind']) => {
    for (const file of files) {
      const error =
        kind === 'zip' && !/\.zip$/i.test(file.name)
          ? '请选择ZIP文件'
          : !file.size
            ? '文件为空，请重新选择'
            : file.size > limit(kind)
              ? '文件大小超过当前上传限制，请拆分或压缩后重新选择'
              : ''
      uploads.value.push({
        id: crypto.randomUUID(),
        file,
        kind,
        key: crypto.randomUUID(),
        percent: null,
        progress: { loaded: 0, total: null, percent: null },
        cancelled: false,
        busy: false,
        error,
        unknown: false,
        accepted: null,
        queued: !error,
        invalid: !!error
      })
    }
  }
  /** 仅将明确重试的失败文件重新加入队列，保留原操作键
   * @param item 尚未确认接收的失败文件
   */
  const retryUpload = (item: ImportUpload) => {
    if (item.busy || item.accepted || item.invalid) return
    if (item.cancelled && !item.unknown) return
    item.queued = true
    void start()
  }
  /** 取消传输，服务器是否已接收须通过原凭证确认
   * @param id 当前传输文件的本地引用
   */
  const cancel = (id: string) => {
    const item = uploads.value.find((value) => value.id === id)
    if (item) item.cancelled = true
    controllers.get(id)?.abort()
  }
  /** 只移除未接收且不存在未知结果的本地资料
   * @param item 准备移除的本地文件
   */
  const remove = (item: ImportUpload) => {
    if (item.busy || item.accepted || item.unknown) return
    uploads.value = uploads.value.filter((value) => value.id !== item.id)
  }
  /** 清理服务端确认移除的接收记录，其他传输和队列继续运行
   * @param ids 已从本批次移除的源文件编号
   */
  const discardAccepted = (ids: string[]) => {
    const removed = new Set(ids)
    const retained = uploads.value.filter(
      (item) => !item.accepted || !removed.has(item.accepted.id)
    )
    if (retained.length !== uploads.value.length) uploads.value = retained
  }
  onBeforeUnmount(() => {
    alive = false
    for (const controller of controllers.values()) controller.abort()
  })
  return {
    uploads,
    running,
    transferring,
    pendingCount,
    add,
    start,
    retryUpload,
    cancel,
    remove,
    discardAccepted
  }
}

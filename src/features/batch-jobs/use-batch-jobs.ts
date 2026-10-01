import { readonly, ref } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'

import type { BatchJobAdapter } from './batch-job-adapter'
import type { BatchJob, TrashEntry } from './batch-job-model'
import type { DeepReadonly, Ref } from 'vue'

export interface BatchJobsController {
  command(batchId: string, operation: 'cancel' | 'retry-failed'): Promise<void>
  commandTrash(entryId: string, operation: 'cleanup' | 'restore'): Promise<void>
  create(
    jobType: string,
    targetIds: string[],
    inputPayload?: Record<string, unknown>
  ): Promise<void>
  error: Readonly<Ref<null | string>>
  jobs: DeepReadonly<Ref<BatchJob[]>>
  load(page?: number): Promise<void>
  page: Readonly<Ref<number>>
  pageSize: Readonly<Ref<number>>
  state: Readonly<Ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>>
  total: Readonly<Ref<number>>
  trash: DeepReadonly<Ref<TrashEntry[]>>
  trashDraft(sceneId: string, revisionId: string): Promise<void>
}

/**
 * 管理通用批量任务和草稿回收站
 *
 * @param adapter - 批量任务适配器
 * @returns 批量任务控制器
 */
export function useBatchJobs(adapter: BatchJobAdapter): BatchJobsController {
  const jobs = ref<BatchJob[]>([])
  const trash = ref<TrashEntry[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const error = ref<null | string>(null)
  const state = ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>('idle')
  const createCommand = useIdempotentCommand(
    (input: { jobType: string; targetIds: string[]; inputPayload: Record<string, unknown> }, key) =>
      adapter.create(input.jobType, input.targetIds, key, input.inputPayload)
  )
  const batchCommand = useIdempotentCommand(
    (input: { batchId: string; operation: 'cancel' | 'retry-failed' }, key) =>
      adapter.command(input.batchId, input.operation, key)
  )
  const trashDraftCommand = useIdempotentCommand(
    (input: { revisionId: string; sceneId: string }, key) =>
      adapter.trash(input.sceneId, input.revisionId, key)
  )
  const trashEntryCommand = useIdempotentCommand(
    (input: { entryId: string; operation: 'cleanup' | 'restore' }, key) =>
      adapter.commandTrash(input.entryId, input.operation, key)
  )

  /**
   * 加载任务分页和回收站
   * @param nextPage - 目标页码
   */
  async function load(nextPage = page.value): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      const [nextBatchPage, trashEntries] = await Promise.all([
        adapter.list(nextPage, pageSize.value),
        adapter.listTrash()
      ])
      jobs.value = nextBatchPage.items
      page.value = nextPage
      pageSize.value = nextBatchPage.pageSize
      total.value = nextBatchPage.total
      trash.value = trashEntries
      state.value = 'success'
    } catch (failure) {
      fail(failure, '批量任务加载失败')
      throw failure
    }
  }

  /**
   * 创建批量任务
   * @param jobType - 任务类型
   * @param targetIds - 目标编号
   * @param inputPayload - 任务参数
   */
  async function create(
    jobType: string,
    targetIds: string[],
    inputPayload: Record<string, unknown> = {}
  ): Promise<void> {
    await run(async () => {
      const created = await createCommand.submit({ jobType, targetIds, inputPayload })
      createCommand.reset()
      const existing = jobs.value.findIndex((item) => item.id === created.id)
      if (existing >= 0) jobs.value.splice(existing, 1, created)
      else {
        jobs.value = [created, ...jobs.value]
        total.value += 1
      }
    })
  }

  /**
   * 取消任务或仅重试失败项
   * @param batchId - 批量任务编号
   * @param operation - 任务命令
   */
  async function command(batchId: string, operation: 'cancel' | 'retry-failed'): Promise<void> {
    await run(async () => {
      const result = await batchCommand.submit({ batchId, operation })
      batchCommand.reset()
      const existing = jobs.value.findIndex((item) => item.id === result.id)
      if (existing >= 0) jobs.value.splice(existing, 1, result)
      else jobs.value.unshift(result)
    })
  }

  /**
   * 将草稿移入回收站
   * @param sceneId - 场景编号
   * @param revisionId - 草稿版本编号
   */
  async function trashDraft(sceneId: string, revisionId: string): Promise<void> {
    await run(async () => {
      const entry = await trashDraftCommand.submit({ revisionId, sceneId })
      trashDraftCommand.reset()
      trash.value = [entry, ...trash.value.filter((item) => item.id !== entry.id)]
    })
  }

  /**
   * 恢复或清理回收站记录
   * @param entryId - 回收站记录编号
   * @param operation - 回收站命令
   */
  async function commandTrash(entryId: string, operation: 'cleanup' | 'restore'): Promise<void> {
    await run(async () => {
      const entry = await trashEntryCommand.submit({ entryId, operation })
      trashEntryCommand.reset()
      trash.value = trash.value.map((item) => (item.id === entry.id ? entry : item))
    })
  }

  /**
   * 统一执行写操作并维护状态
   * @param action - 待执行写操作
   */
  async function run(action: () => Promise<void>): Promise<void> {
    state.value = 'saving'
    error.value = null
    try {
      await action()
      state.value = 'success'
    } catch (failure) {
      fail(failure, '批量任务操作失败')
      throw failure
    }
  }

  /**
   * 记录控制器错误状态
   * @param failure - 捕获的异常
   * @param fallback - 未知异常提示
   */
  function fail(failure: unknown, fallback: string): void {
    error.value = failure instanceof Error ? failure.message : fallback
    state.value = 'error'
  }

  return {
    command,
    commandTrash,
    create,
    error: readonly(error),
    jobs: readonly(jobs),
    load,
    page: readonly(page),
    pageSize: readonly(pageSize),
    state: readonly(state),
    total: readonly(total),
    trash: readonly(trash),
    trashDraft
  }
}

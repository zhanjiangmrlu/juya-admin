import { readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'

import type { OcrAdapter } from './ocr-adapter'
import type { OcrCandidate, OcrConfirmation, OcrJob } from './ocr-model'
import type { DeepReadonly, Ref } from 'vue'

export interface OcrReviewController {
  activeJobId: Readonly<Ref<string>>
  candidate: DeepReadonly<Ref<null | OcrCandidate>>
  command(operation: 'cancel' | 'retry'): Promise<OcrJob>
  confirm(sceneId: string): Promise<OcrConfirmation>
  confirmation: DeepReadonly<Ref<null | OcrConfirmation>>
  contentText: Ref<string>
  error: Readonly<Ref<null | string>>
  job: DeepReadonly<Ref<null | OcrJob>>
  load(): Promise<void>
  setContentText(value: string): void
  state: Readonly<Ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>>
}

/**
 * 管理 OCR 任务、候选和人工确认状态
 *
 * @param adapter - OCR 管理适配器
 * @param jobId - 当前任务编号
 * @returns OCR 校对控制器
 */
export function useOcrReview(adapter: OcrAdapter, jobId: string): OcrReviewController {
  const activeJobId = ref(jobId)
  const job = shallowRef<null | OcrJob>(null)
  const candidate = shallowRef<null | OcrCandidate>(null)
  const confirmation = shallowRef<null | OcrConfirmation>(null)
  const contentText = ref('')
  const error = ref<null | string>(null)
  const state = ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>('idle')
  const confirmCommand = useIdempotentCommand(
    (input: { content: Record<string, unknown>; jobId: string; sceneId: string }, key) =>
      adapter.confirm(input.jobId, input.sceneId, input.content, key)
  )
  const taskCommand = useIdempotentCommand(
    (input: { jobId: string; operation: 'cancel' | 'retry' }, key) =>
      adapter.command(input.jobId, input.operation, key)
  )

  /** 加载任务和候选快照。 */
  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      const nextJob = await adapter.getJob(activeJobId.value)
      job.value = nextJob
      if (nextJob.status === 'SUCCEEDED') {
        const nextCandidate = await adapter.getCandidate(activeJobId.value)
        candidate.value = nextCandidate
        if (!contentText.value) contentText.value = JSON.stringify(nextCandidate.content, null, 2)
      } else {
        candidate.value = null
      }
      state.value = 'success'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'OCR 任务加载失败'
      state.value = 'error'
      throw failure
    }
  }

  /**
   * 替换当前人工编辑文本
   * @param value - JSON 文本
   */
  function setContentText(value: string): void {
    contentText.value = value
  }

  /**
   * 将人工校对内容确认成草稿版本
   * @param sceneId - 目标场景编号
   * @returns 新建或已存在的人工版本
   */
  async function confirm(sceneId: string): Promise<OcrConfirmation> {
    state.value = 'saving'
    error.value = null
    try {
      const parsed = JSON.parse(contentText.value) as unknown
      if (!isRecord(parsed)) throw new Error('人工版本必须是 JSON 对象')
      const result = await confirmCommand.submit({
        content: parsed,
        jobId: activeJobId.value,
        sceneId
      })
      confirmation.value = result
      state.value = 'success'
      return result
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '人工版本保存失败'
      state.value = 'error'
      throw failure
    }
  }

  /**
   * 执行取消或重试命令
   * @param operation - 任务命令
   * @returns 操作后的任务快照
   */
  async function command(operation: 'cancel' | 'retry'): Promise<OcrJob> {
    state.value = 'saving'
    error.value = null
    try {
      const result = await taskCommand.submit({ jobId: activeJobId.value, operation })
      job.value = result
      if (result.id !== activeJobId.value) {
        activeJobId.value = result.id
        candidate.value = null
        confirmation.value = null
        contentText.value = ''
      }
      state.value = 'success'
      return result
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : 'OCR 任务操作失败'
      state.value = 'error'
      throw failure
    }
  }

  return {
    activeJobId: readonly(activeJobId),
    candidate: readonly(candidate),
    command,
    confirm,
    confirmation: readonly(confirmation),
    contentText,
    error: readonly(error),
    job: readonly(job),
    load,
    setContentText,
    state: readonly(state)
  }
}

/**
 * 判断解析后的 JSON 是否为对象
 * @param value - 待检查值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

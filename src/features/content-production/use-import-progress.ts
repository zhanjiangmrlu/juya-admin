import { onScopeDispose, ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { ProductionSchema as S } from './work-order-model'

export type ImportProgressState =
  'loading' | 'waiting' | 'checking' | 'ready' | 'failed' | 'cancelled' | 'disconnected' | 'error'
interface ProgressDependencies {
  read: (id: string, signal: AbortSignal) => Promise<S['ImportPreview']>
  stages: (
    batch: string,
    signal: AbortSignal
  ) => Promise<{ stage: string; status: string; error_code?: string | null }[]>
  ready: (id: string) => Promise<unknown>
}

/**
 * 自动读取当前导入校验状态，终态停止更新以保留人工选择
 * @param dependencies - 当前工作单的预览、实际阶段和完成后的只读刷新
 * @returns 当前操作结果或完成状态
 */
export const useImportProgress = (dependencies: ProgressDependencies) => {
  const state = ref<ImportProgressState>('loading')
  const preview = shallowRef<S['ImportPreview'] | null>(null)
  const message = ref('')
  const longRunning = ref(false)
  let identity = '',
    generation = 0,
    failures = 0
  let running = false,
    inFlight = false,
    disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let slowTimer: ReturnType<typeof setTimeout> | undefined
  let controller: globalThis.AbortController | undefined
  /**
   * 判断浏览器是否已隐藏，异步返回时重新读取可见性
   * @returns 当前页面是否隐藏
   */
  const hidden = (): boolean => document.visibilityState === 'hidden'
  /**
   * 清理等待计时，保留已经读取的结果
   * @returns 当前操作结果或完成状态
   */
  const clearTimers = (): void => {
    clearTimeout(timer)
    clearTimeout(slowTimer)
    timer = slowTimer = undefined
  }
  /**
   * 停止当前上下文，离页返回的旧响应不能再写入
   * @returns 当前操作结果或完成状态
   */
  const stop = (): void => {
    generation++
    running = false
    inFlight = false
    clearTimers()
    controller?.abort()
  }
  /**
   * 结束等待，terminal 为权威结束状态，text 为接口给出的失败说明
   * @param terminal - 权威结束状态
   * @param text - 接口给出的失败说明
   * @returns 当前操作结果或完成状态
   */
  const finish = (terminal: ImportProgressState, text = ''): void => {
    running = false
    clearTimers()
    state.value = terminal
    message.value = text
  }
  /**
   * 串行读取当前批次，网络失败只重读查询，不重试业务命令
   * @returns 当前操作结果或完成状态
   */
  const read = async (): Promise<void> => {
    if (!running || disposed || inFlight || hidden()) return
    inFlight = true
    const token = generation,
      id = identity
    controller = new globalThis.AbortController()
    const signal = controller.signal
    /**
     * 判断读取仍属于当前导入上下文
     * @returns 当前操作结果或完成状态
     */
    const current = (): boolean =>
      !disposed && token === generation && identity === id && !signal.aborted
    try {
      const result = await dependencies.read(id, signal)
      if (!current()) return
      if (result.work_order_id !== id) throw new Error('导入预览不属于当前工作单')
      if (result.status === 'FAILED' || result.status === 'CANCELLED') {
        preview.value = result
        finish(
          result.status === 'FAILED' ? 'failed' : 'cancelled',
          result.batch_issues
            .map((issue) => issue.message)
            .filter(Boolean)
            .join('；')
        )
      } else if (result.status === 'PENDING') {
        const stages = await dependencies.stages(result.batch_id, signal)
        if (!current()) return
        const validation = stages.find((stage) => stage.stage === 'VALIDATE')
        if (validation?.status === 'FAILED' || validation?.status === 'CANCELLED') {
          finish(
            validation.status === 'FAILED' ? 'failed' : 'cancelled',
            validation.error_code || ''
          )
          return
        }
        state.value =
          validation?.status === 'RUNNING'
            ? 'checking'
            : ['PENDING', 'QUEUED', 'RETRY'].includes(validation?.status || '')
              ? 'waiting'
              : 'loading'
        failures = 0
      } else if (
        ['PREVIEW_READY', 'CONFIRMING', 'PARTIAL', 'CONFIRMED', 'COMPLETED'].includes(result.status)
      ) {
        await dependencies.ready(id)
        if (!current()) return
        preview.value = result
        finish('ready')
      } else {
        finish('error', '导入状态暂不可识别，请重新读取状态')
      }
    } catch (failure) {
      if (!current()) return
      if (failure instanceof ApiError && failure.status < 500 && failure.status !== 429) {
        finish('error', failure.message)
      } else if (++failures >= 3) {
        finish('disconnected', '连接暂时中断，请重新连接以读取校验结果')
      }
    } finally {
      if (current()) {
        inFlight = false
        if (running && !hidden())
          timer = setTimeout(() => {
            void read()
          }, 2000)
      }
    }
  }
  /**
   * 开始当前导入读取，id 为服务端返回的工作单身份
   * @param id - 服务端工作单身份
   * @returns 当前操作结果或完成状态
   */
  const start = async (id: string): Promise<void> => {
    stop()
    if (disposed) return
    identity = id
    failures = 0
    running = true
    preview.value = null
    state.value = 'loading'
    message.value = ''
    longRunning.value = false
    slowTimer = setTimeout(() => {
      longRunning.value = true
    }, 60000)
    await read()
  }
  /**
   * 仅恢复断开的查询，不重新上传或提交导入命令
   * @returns 当前操作结果或完成状态
   */
  const reconnect = async (): Promise<void> => {
    if (!inFlight && identity && !running) await start(identity)
  }
  /**
   * 隐藏时暂停定时查询，重新可见时立即获取实际状态
   * @returns 当前操作结果或完成状态
   */
  const visibility = (): void => {
    clearTimeout(timer)
    timer = undefined
    if (document.visibilityState !== 'hidden' && running) void read()
  }
  document.addEventListener('visibilitychange', visibility)
  onScopeDispose(() => {
    disposed = true
    stop()
    document.removeEventListener('visibilitychange', visibility)
  })
  return { state, preview, message, longRunning, start, reconnect, stop }
}

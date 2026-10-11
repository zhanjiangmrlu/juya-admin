import { computed, ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  PublicationCandidate,
  PublicationRange,
  PublicationRangeAdapter
} from './publication-range-adapter'

export const /**
   * 将数据库 UTC 期限转为浏览器可比较的时间
   * @param range - 固定发布范围
   * @returns 期限的毫秒时间戳
   */ publicationDeadline = (range: PublicationRange): number =>
    Date.parse(
      /[zZ]|[+-]\d{2}:\d{2}$/.test(range.expires_at) ? range.expires_at : `${range.expires_at}Z`
    )

export const /**
   * 保持固定范围、明确子集、结果恢复与幂等命令
   * @param adapter - 真实冻结发布范围接口
   * @returns 异步发布控制器
   */ usePublicationRange = (adapter: PublicationRangeAdapter) => {
    const range = shallowRef<PublicationRange | null>(null)
    const selected = ref<string[]>([])
    const acknowledged = ref(false)
    const busy = ref(false)
    const error = ref('')
    const stale = ref(false)
    let generation = 0
    let disposed = false
    let signature = ''
    let key = ''
    const canConfirm = computed(
      () =>
        !!range.value &&
        !busy.value &&
        !stale.value &&
        acknowledged.value &&
        selected.value.length > 0 &&
        new Set(selected.value).size === selected.value.length &&
        !['QUEUED', 'RUNNING'].includes(range.value.status) &&
        publicationDeadline(range.value) > Date.now() &&
        selected.value.every(
          (id) =>
            range.value!.candidates.some((candidate) => candidate.revision_id === id) &&
            range.value!.results.items[id]?.status !== 'SUCCEEDED'
        )
    )
    const /**
       * 串行读取真实结果并隔离离页返回
       * @param action - 固定范围的真实命令
       * @param reset - 是否重新要求明确选择与人工确认
       */ run = async (action: () => Promise<PublicationRange>, reset = false): Promise<void> => {
        if (busy.value || disposed) return
        const token = ++generation
        busy.value = true
        error.value = ''
        try {
          const result = await action()
          if (disposed || token !== generation) return
          range.value = result
          selected.value = reset
            ? []
            : selected.value.filter(
                (id) =>
                  result.candidates.some((candidate) => candidate.revision_id === id) &&
                  result.results.items[id]?.status !== 'SUCCEEDED'
              )
          if (reset) acknowledged.value = false
          stale.value = false
        } catch (failure) {
          if (!disposed && token === generation) {
            error.value = failure instanceof Error ? failure.message : '范围发布操作失败'
            if (failure instanceof ApiError && failure.status === 409) {
              stale.value = true
              acknowledged.value = false
            }
          }
        } finally {
          if (token === generation) busy.value = false
        }
      }
    const /**
       * 冻结明确校对合格的集合，不自动勾选发布成员
       * @param candidates - 完整固定版本和已明确警告
       */ freeze = async (candidates: PublicationCandidate[]): Promise<void> => {
        if (!candidates.length || candidates.length > 1000) return
        await run(() => adapter.preview(candidates), true)
      }
    const /**
       * 恢复指定范围，重新要求管理员选择目标子集
       * @param token - 本管理员创建的范围编号
       */ restore = async (token: string): Promise<void> => {
        if (token.trim()) await run(() => adapter.load(token.trim()), true)
      }
    const /** 刷新异步逐项结果，过滤已经成功的重试项 */ refresh = async (): Promise<void> => {
        if (range.value) await run(() => adapter.load(range.value!.token))
      }
    const /** 202 只代表已排队，读取真实结果后展示处理状态 */ confirm = async (): Promise<void> => {
        if (range.value && publicationDeadline(range.value) <= Date.now()) {
          stale.value = true
          error.value = '发布范围预览已过期，请重新读取当前候选并冻结'
          return
        }
        if (!canConfirm.value || !range.value) return
        const frozen = range.value
        const subset = [...selected.value].sort()
        const next = JSON.stringify([frozen.token, frozen.version, frozen.collection_hash, subset])
        if (next !== signature) {
          signature = next
          key = createIdempotencyKey()
        }
        await run(async () => {
          await adapter.confirm(frozen, subset, key)
          return adapter.load(frozen.token)
        })
      }
    const /** 仅选择服务端已失败的范围内候选，并重新要求人工确认 */ selectFailed = (): void => {
        if (!range.value || busy.value || ['QUEUED', 'RUNNING'].includes(range.value.status)) return
        selected.value = range.value.candidates
          .filter(
            (candidate) => range.value!.results.items[candidate.revision_id]?.status === 'FAILED'
          )
          .map((candidate) => candidate.revision_id)
        acknowledged.value = false
      }
    const /** 候选变化后撤销旧预览，后台已提交任务由恢复入口查看 */ invalidate = (): void => {
        generation++
        range.value = null
        selected.value = []
        acknowledged.value = false
        busy.value = false
        signature = ''
        stale.value = false
      }
    const /** 离页释放受限候选，不取消已经明确提交的后台任务 */ dispose = (): void => {
        disposed = true
        invalidate()
      }
    return {
      range,
      selected,
      acknowledged,
      busy,
      error,
      stale,
      canConfirm,
      freeze,
      restore,
      refresh,
      confirm,
      selectFailed,
      invalidate,
      dispose
    }
  }

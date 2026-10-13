import { computed, ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  ContentStage,
  ContentStageRetry,
  createContentStageAdapter
} from './content-stage-adapter'

export const /**
   * 绑定失败阶段的依赖、围栏、版本与人工恢复意图
   * @param adapter - 实际阶段读取和恢复接口
   * @returns 可明确重试的阶段状态
   */ useContentStage = (
    adapter: Pick<ReturnType<typeof createContentStageAdapter>, 'load' | 'retry'>
  ) => {
    const stage = shallowRef<ContentStage | null>(null)
    const confirmed = ref(false)
    const chargedAcknowledged = ref(false)
    const editVersion = ref<number | null>(null)
    const busy = ref(false)
    const stale = ref(false)
    const error = ref('')
    let signature = ''
    let key = ''
    let generation = 0
    let disposed = false
    const charged = computed(
      () => !!stage.value && ['AI_LEXICON', 'ASR_BOUNDARY', 'ASR_POLL'].includes(stage.value.stage)
    )
    const needsVersion = computed(
      () => charged.value || ['SENTENCE_SLICE', 'AUTO_AUDIO'].includes(stage.value?.stage ?? '')
    )
    const canRetry = computed(
      () =>
        !!stage.value &&
        stage.value.status === 'FAILED' &&
        !stage.value.stage.startsWith('PUBLICATION_RANGE_') &&
        !busy.value &&
        !stale.value &&
        confirmed.value &&
        (!charged.value || chargedAcknowledged.value) &&
        (!needsVersion.value ||
          (Number.isSafeInteger(editVersion.value) && Number(editVersion.value) > 0))
    )
    const /**
       * 重新读取真实阶段，清除此前确认和已失效版本
       * @param id - 已知服务端阶段编号
       */ load = async (id: string): Promise<void> => {
        if (busy.value || disposed || !id.trim()) return
        const token = ++generation
        busy.value = true
        error.value = ''
        confirmed.value = false
        chargedAcknowledged.value = false
        try {
          const result = await adapter.load(id.trim())
          if (token === generation && !disposed) {
            if (result.public_id !== id.trim()) throw new Error('阶段响应与请求不一致')
            stage.value = result
            stale.value = false
            signature = ''
          }
        } catch (failure) {
          if (token === generation && !disposed) {
            error.value = failure instanceof Error ? failure.message : '阶段读取失败'
            stage.value = null
          }
        } finally {
          if (token === generation) busy.value = false
        }
      }
    const /** 明确恢复失败阶段，202 后重新读取新任务，不重置未知收费结果 */ retry =
        async (): Promise<void> => {
          if (!canRetry.value || !stage.value || disposed) return
          const frozen = stage.value
          const body: ContentStageRetry = {
            expected_fence: frozen.fencing_version,
            input_hash: frozen.input_hash,
            config_version: frozen.config_version,
            ...(needsVersion.value ? { expected_edit_version: editVersion.value! } : {}),
            manual_confirmed: true,
            acknowledged_charged_retry: chargedAcknowledged.value
          }
          const next = JSON.stringify([frozen.public_id, body])
          if (signature !== next) {
            signature = next
            key = createIdempotencyKey()
          }
          const token = ++generation
          busy.value = true
          error.value = ''
          try {
            const receipt = await adapter.retry(frozen.public_id, body, key)
            const result = await adapter.load(receipt.stage_id)
            if (token !== generation || disposed) return
            stage.value = result
            confirmed.value = false
            chargedAcknowledged.value = false
            signature = ''
          } catch (failure) {
            if (token === generation && !disposed) {
              error.value = failure instanceof Error ? failure.message : '阶段恢复失败'
              if (failure instanceof ApiError && failure.status === 409) {
                stale.value = true
                confirmed.value = false
              }
            }
          } finally {
            if (token === generation) busy.value = false
          }
        }
    const /** 改选阶段时撤销旧返回和确认 */ invalidate = (): void => {
        generation++
        stage.value = null
        busy.value = false
        signature = ''
        confirmed.value = false
        chargedAcknowledged.value = false
        stale.value = false
      }
    const /** 离页释放阶段依赖 */ dispose = (): void => {
        disposed = true
        invalidate()
      }
    return {
      stage,
      confirmed,
      chargedAcknowledged,
      editVersion,
      busy,
      stale,
      error,
      charged,
      needsVersion,
      canRetry,
      load,
      retry,
      invalidate,
      dispose
    }
  }

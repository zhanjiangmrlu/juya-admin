<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { dateText } from '@/services/display'
import { listeningOperation, listeningRequest } from '@/services/listening-service'

import type { Timeline } from './listening-types'

import { statusLabels } from './listening-model'

const props = defineProps<{
  articleId?: string
  batchId?: string
  candidateId?: string
  revision: number
}>()
const emit = defineEmits<{ changed: [timeline: Timeline] }>()
const path = computed(() =>
  props.batchId && props.candidateId
    ? `/imports/${props.batchId}/candidates/${props.candidateId}/timeline`
    : `/articles/${props.articleId}/timeline`
)
const timeline = ref<Timeline | null>(null),
  busy = ref(false),
  error = ref('')
const timelineErrors: Record<string, string> = {
  asr_unconfigured: '自动时间轴服务尚未配置，请配置语音识别服务后重试',
  asr_permission_denied: '语音识别服务权限不足，请检查服务授权后重试',
  asr_rate_limited: '语音识别服务繁忙，请稍后重试',
  asr_budget_exceeded: '今日自动识别次数已用完，请明日重试或联系管理员',
  asr_request_invalid: '语音识别请求未通过校验，请联系管理员核对配置和音频',
  asr_input_too_large: '识别音频超出服务限制，请联系管理员核对音频处理方式',
  asr_decoder_unavailable: '音频预处理服务暂不可用，请联系管理员检查',
  asr_preprocessing_failed: '音频预处理失败，请核对完整英文音频后重试',
  asr_recognition_failed: '录音识别失败，请核对完整英文音频后重试',
  asr_submission_unknown: '识别任务提交结果尚未确认，请联系管理员核对，避免重复提交',
  asr_poll_unavailable: '暂时无法获取识别结果，系统将继续查询',
  timeline_coverage_low: '录音与正文匹配不足，请核对完整英文音频和英文正文后重新保存',
  timeline_invalid: '识别时间轴未通过校验，请核对完整英文音频后重试'
}
const timelineError = computed(() =>
  timeline.value?.error_code
    ? timelineErrors[timeline.value.error_code] || '时间轴生成失败，请稍后重试或联系管理员'
    : ''
)
let timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0
/** 查询当前正文与音频关联的真实时间轴状态 */
const refresh = async () => {
  const run = ++generation
  clearTimeout(timer)
  busy.value = true
  error.value = ''
  try {
    const value = await listeningRequest<Timeline>(path.value)
    if (run !== generation) return
    timeline.value = value
    emit('changed', value)
    if (['pending', 'processing'].includes(value.state))
      timer = setTimeout(() => {
        void refresh()
      }, 5000)
  } catch (reason) {
    if (run === generation)
      error.value = reason instanceof Error ? reason.message : '暂未获取时间轴'
  } finally {
    if (run === generation) busy.value = false
  }
}
/** 失败对象可重试，试听记录可选且不影响发布
 * @param action 重新生成失败任务或记录管理员试听
 */
const operate = async (action: 'retry' | 'review') => {
  busy.value = true
  try {
    await listeningOperation<Timeline>('POST', `${path.value}/${action}`, {
      revision: props.revision
    })()
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '操作失败，请刷新确认状态'
  } finally {
    busy.value = false
  }
}
watch(
  () => [path.value, props.revision],
  () => {
    void refresh()
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>
<template>
  <section class="timeline-panel">
    <div class="between">
      <h3>逐字时间轴</h3>
      <button type="button" :disabled="busy" @click="refresh">刷新状态</button>
    </div>
    <p>{{ statusLabels[timeline?.state || ''] || '暂未获取' }}</p>
    <p v-if="timelineError" class="notice error" role="alert">{{ timelineError }}</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p class="muted small">
      正文与音频保存后自动生成；校验通过即可启用。未试听或暂未就绪不阻止满足原必填条件的发布
    </p>
    <p v-if="timeline?.reviewed_at" class="muted small">
      已试听：{{ dateText(timeline.reviewed_at) }}
    </p>
    <div class="row">
      <button
        v-if="['failed', 'needs_attention'].includes(timeline?.state || '')"
        type="button"
        :disabled="busy"
        @click="operate('retry')"
      >
        重试失败任务</button
      ><button
        v-if="timeline?.state === 'ready'"
        type="button"
        :disabled="busy"
        @click="operate('review')"
      >
        标记已试听（可选）
      </button>
    </div>
  </section>
</template>
<style scoped lang="scss">
.timeline-panel {
  margin-top: 24px;
  border-top: 1px solid var(--line);
  padding-top: 24px;

  p {
    margin: 12px 0;
  }
}
</style>

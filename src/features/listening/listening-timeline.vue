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
    <p v-if="timeline?.error_code" class="notice error">{{ timeline.error_code }}</p>
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

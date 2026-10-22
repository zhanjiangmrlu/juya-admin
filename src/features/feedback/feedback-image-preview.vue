<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { feedbackImageURL } from '@/services/feedback-service'
import { api } from '@/services/http-client'

import type { FeedbackImage } from '@/shared/types/feedback'
const props = defineProps<{ image: FeedbackImage }>()
const emit = defineEmits<{ close: [] }>()
const current = ref(props.image),
  error = ref(''),
  busy = ref(false)
const source = computed(() => {
  try {
    return feedbackImageURL(current.value.url)
  } catch {
    return ''
  }
})
/** 过期或读取失败后续签同一附件，不建立公开图片入口 */
const renew = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    current.value = await api.request<FeedbackImage>(
      `/api/admin/v1/feedback/images/${encodeURIComponent(props.image.id)}/url`
    )
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '截图暂不可用'
  } finally {
    busy.value = false
  }
}
watch(
  () => props.image,
  (value) => {
    current.value = value
    error.value = ''
  }
)
</script>
<template>
  <ElDialog
    :model-value="true"
    title="反馈截图"
    width="min(1100px,95vw)"
    align-center
    append-to-body
    @close="emit('close')"
  >
    <AppState :busy="busy" :error="error" @retry="renew" />
    <div v-if="!error && source" class="feedback-image">
      <img
        :src="source"
        alt="用户提交的反馈截图"
        @error="error = '截图地址可能已过期，请重新获取'"
      />
    </div>
    <template #footer
      ><button :disabled="busy" @click="renew">重新获取截图</button
      ><button @click="emit('close')">关闭</button></template
    >
  </ElDialog>
</template>
<style scoped lang="scss">
.feedback-image {
  max-height: 72vh;
  overflow: auto;
  text-align: center;

  img {
    max-width: 100%;
    height: auto;
  }
}
</style>

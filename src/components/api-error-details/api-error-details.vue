<script setup lang="ts">
import { computed } from 'vue'

import type { ApiError } from '@/shared/errors/api-error'

const props = defineProps<{ error: ApiError | null }>()
const fields = computed(() => {
  const errors = props.error?.details.errors
  if (props.error?.status !== 422 || !Array.isArray(errors)) return []
  return errors.flatMap((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('msg' in item) ||
      typeof item.msg !== 'string'
    )
      return []
    const location =
      'loc' in item && Array.isArray(item.loc)
        ? item.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
        : ''
    return [`${location ? `${location}：` : ''}${item.msg}`]
  })
})
const retrySeconds = computed(
  () => props.error?.details.retry_after_seconds ?? props.error?.details.retry_after
)
</script>

<template>
  <div v-if="error" class="api-error-details">
    <ul v-if="fields.length">
      <li v-for="field in fields" :key="field">{{ field }}</li>
    </ul>
    <p v-if="error.status === 429">
      请{{ typeof retrySeconds === 'number' ? `在 ${retrySeconds} 秒后` : '稍后' }}重试。
    </p>
    <p v-if="error.status >= 500">服务暂不可用，请稍后重试；若持续失败，请提供请求编号协助排查。</p>
    <p v-if="error.requestId">Request ID：{{ error.requestId }}</p>
  </div>
</template>

<style scoped lang="scss">
.api-error-details {
  overflow-wrap: anywhere;

  p,
  ul {
    margin: 8px 0;
  }
}
</style>

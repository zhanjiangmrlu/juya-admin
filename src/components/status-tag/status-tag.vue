<script setup lang="ts">
import { CircleCheck, CircleClose, InfoFilled, Warning } from '@element-plus/icons-vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    tone?: 'danger' | 'info' | 'success' | 'warning'
  }>(),
  { tone: 'info' }
)

const tagType = computed(() => (props.tone === 'info' ? undefined : props.tone))
const toneIcon = computed(() => {
  const icons = {
    danger: CircleClose,
    info: InfoFilled,
    success: CircleCheck,
    warning: Warning
  }
  return icons[props.tone]
})
</script>

<template>
  <ElTag class="status-tag" :class="`status-tag--${tone}`" :type="tagType" effect="light" round>
    <ElIcon><component :is="toneIcon" /></ElIcon>
    <span>{{ label }}</span>
  </ElTag>
</template>

<style scoped lang="scss">
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &__icon {
    font-size: 12px;
  }
}
</style>

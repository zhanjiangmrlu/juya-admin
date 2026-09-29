<script setup lang="ts">
import { Hide, View } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    canCopy?: boolean
    value: string | null
  }>(),
  { canCopy: false }
)
const revealed = ref(false)
const displayValue = computed(() => {
  if (!props.value) return '未填写'
  if (revealed.value) return props.value
  if (props.value.length <= 4) return '••••'
  return `${props.value.slice(0, 2)}••••${props.value.slice(-2)}`
})

/**
 * 切换敏感值的遮罩显示状态
 *
 * @returns 无返回值
 */
function toggleReveal(): void {
  revealed.value = !revealed.value
}
</script>

<template>
  <span class="sensitive-value">
    <code class="text">{{ displayValue }}</code>
    <ElButton
      :aria-label="revealed ? '隐藏敏感值' : '显示敏感值'"
      circle
      text
      @click="toggleReveal"
    >
      <ElIcon><Hide v-if="revealed" /><View v-else /></ElIcon>
    </ElButton>
    <ElTooltip :content="canCopy ? '复制敏感值' : '复制审计接口待接入'">
      <span><ElButton :disabled="!canCopy" size="small">复制</ElButton></span>
    </ElTooltip>
  </span>
</template>

<style scoped lang="scss">
.sensitive-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  .text {
    background: transparent;
    color: var(--juya-color-text-primary);
    font-family: inherit;
    font-size: 14px;
  }
}
</style>

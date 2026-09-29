<script setup lang="ts">
withDefaults(
  defineProps<{
    canCopy?: boolean
    copying?: boolean
    value: string | null
  }>(),
  { canCopy: false, copying: false }
)
defineEmits<{ copy: [] }>()
</script>

<template>
  <span class="sensitive-value">
    <span class="text">{{ value || '未填写' }}</span>
    <ElTooltip :content="canCopy ? '复制敏感值' : '复制功能不可用'">
      <span>
        <ElButton
          :disabled="!canCopy || !value"
          :loading="copying"
          size="small"
          @click="$emit('copy')"
        >
          复制
        </ElButton>
      </span>
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
    overflow-wrap: anywhere;
  }
}
</style>

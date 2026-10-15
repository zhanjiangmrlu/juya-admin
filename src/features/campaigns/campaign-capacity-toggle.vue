<script setup lang="ts">
import { ElSwitch } from 'element-plus'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: number | null | undefined; minimum?: number; disabled?: boolean }>(),
  { minimum: 1, disabled: false }
)
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const previousLimit = ref<number>()
const limited = computed(() => props.modelValue !== null && props.modelValue !== undefined)

/**
 * 记住管理员输入或服务端返回的上限
 * @param value - 当前人数上限，null 表示不限制
 */
const rememberLimit = (value: number | null | undefined): void => {
  if (value !== null && value !== undefined && Number.isInteger(value) && value > 0)
    previousLimit.value = value
}
watch(() => props.modelValue, rememberLimit, { immediate: true, flush: 'sync' })

/**
 * 切换人数限制，关闭仅改变草稿
 * @param enabled - 开关提交的状态，true 表示启用上限
 */
const toggle = (enabled: string | number | boolean): void => {
  if (props.disabled) return
  emit(
    'update:modelValue',
    enabled === true ? Math.max(props.minimum, previousLimit.value ?? 1) : null
  )
}
</script>

<template>
  <ElSwitch
    class="campaign-capacity-toggle"
    :model-value="limited"
    :disabled="disabled"
    aria-label="限制人数"
    inline-prompt
    active-text="已限制人数"
    inactive-text="不限人数"
    @update:model-value="toggle"
  />
</template>

<style scoped lang="scss">
.campaign-capacity-toggle {
  width: 200px;
  height: 36px;
  flex: 0 0 200px;

  :deep([class~='el-switch__core']) {
    width: 100%;
    height: 36px;
    border: 0;
    border-radius: 16px;
    background: var(--juya-color-page);
  }

  :deep([class~='el-switch__action']) {
    display: none;
  }

  :deep([class~='el-switch__inner']) {
    padding: 0;

    span {
      color: var(--juya-color-text-secondary);
      font-size: 14px;
    }
  }

  &.is-checked {
    :deep([class~='el-switch__core']) {
      background: var(--juya-color-primary);
    }

    :deep([class~='el-switch__inner'] span) {
      color: white;
    }
  }

  @media (width <= 700px) {
    width: 150px;
    flex-basis: 150px;
  }
}
</style>

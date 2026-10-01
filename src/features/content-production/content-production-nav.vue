<script setup lang="ts">
import type { ProductionStage } from './content-production-model'

import { PRODUCTION_STAGES } from './content-production-model'

const props = defineProps<{ active: ProductionStage; busy?: boolean }>()
const emit = defineEmits<{ select: [stage: ProductionStage] }>()

/**
 * 方向键沿流程切换，同时将键盘焦点移至目标 Tab。
 * @param event - 键盘事件
 * @param index - 当前步骤下标
 */
function move(event: globalThis.KeyboardEvent, index: number): void {
  if (props.busy) return
  const count = PRODUCTION_STAGES.length
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowLeft') next = (index + count - 1) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  else return
  event.preventDefault()
  const current = event.currentTarget as globalThis.HTMLButtonElement
  const target =
    current.parentElement?.querySelectorAll<globalThis.HTMLButtonElement>('[role="tab"]')[next]
  target?.focus()
  emit('select', PRODUCTION_STAGES[next]!.stage)
}
</script>

<template>
  <nav class="production-nav" aria-label="内容生产流程">
    <div class="production-tabs" role="tablist" aria-label="内容生产步骤">
      <button
        v-for="(item, index) in PRODUCTION_STAGES"
        :key="item.stage"
        class="production-tab"
        :class="{ active: active === item.stage }"
        type="button"
        role="tab"
        :aria-selected="active === item.stage"
        :tabindex="active === item.stage ? 0 : -1"
        :disabled="busy"
        @click="emit('select', item.stage)"
        @keydown="move($event, index)"
      >
        {{ item.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.production-nav {
  margin-bottom: 18px;
  overflow-x: auto;
  border-bottom: 1px solid var(--el-border-color-light);
}

.production-tabs {
  display: flex;
  min-width: 600px;
}

.production-tab {
  flex: 1;
  padding: 18px 12px 14px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--juya-color-text-secondary);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;

  &.active {
    border-bottom-color: var(--el-color-primary);
    color: var(--el-color-primary);
    font-weight: 600;
  }

  &:hover,
  &:focus-visible {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

import type { ProductionStage } from './content-production-model'

import { PRODUCTION_STAGES } from './content-production-model'

const props = defineProps<{ active: ProductionStage; busy?: boolean; hideAudio?: boolean }>()
const stages = computed(() =>
  PRODUCTION_STAGES.filter((item) => !props.hideAudio || item.stage !== 'audio')
)
const emit = defineEmits<{ select: [stage: ProductionStage] }>()
const /** 切换明确选择的内容工作区，保存与版本保护由页面执行
   * @param stage - 管理员选中的实际工作区
   */
  select = (stage: ProductionStage): void => {
    if (!props.busy && stages.value.some((item) => item.stage === stage)) emit('select', stage)
  }
</script>
<template>
  <nav class="production-nav" aria-label="内容工作区">
    <ElSelect
      :model-value="active"
      :disabled="busy"
      aria-label="切换内容工作区"
      @update:model-value="select"
    >
      <ElOption v-for="item in stages" :key="item.stage" :label="item.label" :value="item.stage" />
    </ElSelect>
  </nav>
</template>
<style scoped lang="scss">
.production-nav {
  display: flex;
  justify-content: flex-end;

  :deep(.el-select) {
    width: 240px;
  }
}
</style>

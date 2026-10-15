<script setup lang="ts">
import { onMounted, ref } from 'vue'

const targetReady = ref(false)
/** 将页面操作放入布局底栏，独立挂载组件时保留原位置 */
const attach = (): void => {
  targetReady.value = !!globalThis.document.getElementById('admin-page-actions')
}
onMounted(attach)
</script>

<template>
  <Teleport v-if="targetReady" to="#admin-page-actions">
    <div class="app-page-actions"><slot /></div>
  </Teleport>
  <div v-else class="app-page-actions"><slot /></div>
</template>

<style scoped lang="scss">
.app-page-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;

  :deep(.el-button) {
    height: 40px;
    min-height: 40px;
    margin-left: 0;
    padding-inline: 24px;
  }

  :deep(
    [class~='el-button--default']:not(
      .is-text,
      .is-link,
      [class~='el-button--primary'],
      [class~='el-button--danger'],
      [class~='el-button--warning'],
      [class~='el-button--success'],
      [class~='el-button--info']
    )
  ) {
    background: var(--juya-color-primary-soft);
    border-color: transparent;
  }

  @media (width <= 767px) {
    gap: 8px;

    :deep(.el-button) {
      min-height: 40px;
      padding-inline: 12px;
    }
  }
}
</style>

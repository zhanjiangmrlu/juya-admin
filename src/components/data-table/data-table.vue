<script setup lang="ts" generic="T extends object">
withDefaults(
  defineProps<{
    emptyText?: string
    loading?: boolean
    rowKey?: string
    rows: T[]
  }>(),
  {
    emptyText: '暂无数据',
    loading: false,
    rowKey: 'id'
  }
)
</script>

<template>
  <div class="data-table">
    <ElTable v-loading="loading" :data="rows" :empty-text="emptyText" :row-key="rowKey">
      <slot />
    </ElTable>
  </div>
</template>

<style scoped lang="scss">
.data-table {
  width: 100%;
  overflow-x: auto;
}
</style>

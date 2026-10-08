<script setup lang="ts" generic="T extends object">
import { ElTable, ElTableColumn } from 'element-plus'
import { computed } from 'vue'

import { ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'

import type { TableColumnConfig } from './table-column'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    emptyText?: string
    loading?: boolean
    rowKey?: string
    rows: readonly T[]
    columns?: readonly TableColumnConfig[]
  }>(),
  {
    emptyText: ADMIN_UI_DEFAULTS.table.emptyText,
    loading: false,
    rowKey: ADMIN_UI_DEFAULTS.table.rowKey,
    columns: () => []
  }
)
const visibleColumns = computed(() => props.columns.filter((column) => !column.hidden))
const tableRows = computed(() => [...props.rows])
defineSlots<
  { default?: () => unknown } & { [name: string]: (scope: { row: T; $index: number }) => unknown }
>()

/**
 * 未提供业务插槽时返回字段原值，不在展示层虚构缺失数据。
 * @param row - 当前行
 * @param prop - 配置的字段
 * @returns 原字段值
 */
function readCell(row: T, prop?: string): unknown {
  return prop ? Reflect.get(row, prop) : undefined
}
</script>

<template>
  <ElTable
    v-loading="loading"
    v-bind="$attrs"
    class="data-table"
    :data="tableRows"
    :empty-text="emptyText"
    :row-key="rowKey"
  >
    <ElTableColumn
      v-for="column in visibleColumns"
      :key="column.key"
      :label="column.label"
      :prop="column.prop"
      :type="column.type"
      :width="column.width"
      :min-width="column.minWidth"
      :fixed="column.fixed"
      :align="column.align"
      :sortable="column.sortable"
      :show-overflow-tooltip="column.showOverflowTooltip"
    >
      <template v-if="column.slot" #default="scope">
        <!-- Element Plus 注册列时用 $index=-1 的空行探测嵌套列，不能调用业务插槽。 -->
        <slot v-if="scope.$index !== -1" :name="column.slot" v-bind="scope">{{
          readCell(scope.row, column.prop)
        }}</slot>
      </template>
    </ElTableColumn>
    <slot />
  </ElTable>
</template>

<style scoped lang="scss">
.data-table {
  width: 100%;
}
</style>

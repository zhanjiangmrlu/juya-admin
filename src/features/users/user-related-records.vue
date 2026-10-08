<script setup lang="ts">
import dayjs from 'dayjs'

import {
  ADMIN_RELATED_RECORD_LABELS,
  ADMIN_RELATED_RECORD_SECTIONS
} from '@/app/admin-records.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DataTable from '@/components/data-table/data-table.vue'

defineProps<{ records: Record<string, Record<string, unknown>[]> }>()
const sections = ADMIN_RELATED_RECORD_SECTIONS.map((section) => ({
  ...section,
  columns: [
    ...section.fields.map((field) => ({
      key: field,
      label: ADMIN_RELATED_RECORD_LABELS[field],
      minWidth: 150,
      showOverflowTooltip: true,
      slot: field
    })),
    ...(section.route ? [{ key: 'actions', label: '操作', width: 80, slot: 'actions' }] : [])
  ]
}))
/**
 * 只格式化实际记录的时间，缺失数据保持空值。
 * @param key - 记录字段名
 * @param value - 服务端字段值或页码
 * @returns 可读字段文案
 */
function display(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  return key.endsWith('_at') || key === 'start_deadline'
    ? dayjs(String(value)).format('YYYY-MM-DD HH:mm')
    : String(value)
}
</script>

<template>
  <div class="related-records">
    <AdminPanel v-for="section in sections" :key="section.key">
      <template #header>{{ section.title }}</template>
      <DataTable
        :rows="records[section.key] ?? []"
        :columns="section.columns"
        empty-text="暂无记录"
      >
        <template v-for="field in section.fields" :key="field" #[field]="{ row }">{{
          display(field, row[field])
        }}</template>
        <template #actions="{ row }"
          ><RouterLink :to="{ name: section.route, params: { id: String(row.id) } }"
            >查看</RouterLink
          ></template
        >
      </DataTable>
    </AdminPanel>
  </div>
</template>

<style scoped lang="scss">
.related-records {
  display: grid;
  gap: 16px;
  min-width: 0;
  margin-top: 16px;
}
</style>

<script setup lang="ts">
import dayjs from 'dayjs'

import {
  ADMIN_RELATED_RECORD_LABELS,
  ADMIN_RELATED_RECORD_SECTIONS
} from '@/app/admin-records.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DataTable from '@/components/data-table/data-table.vue'
import { formatAdminActor } from '@/shared/utils/admin-actor'

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
const /**
   * 格式化记录时间与操作人，保留无法解析的审计身份
   * @param key - 记录字段名
   * @param value - 服务端字段值或页码
   * @param row - 当前业务记录，包含操作人账号名与原始审计标识
   * @returns 可读字段文案
   */
  display = (key: string, value: unknown, row: Record<string, unknown>): string => {
    if (key === 'actor_public_id') {
      return formatAdminActor(value, row.actor_name)
    }
    if (key === 'reason' && (value === null || value === undefined || !String(value).trim()))
      return '-'
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
          display(field, row[field], row)
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

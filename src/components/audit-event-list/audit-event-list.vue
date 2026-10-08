<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'

import { ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'
import AppPagination from '@/components/app-pagination/app-pagination.vue'

import type { AuditEvent } from '@/features/audit/audit-adapter'
import type { TableInstance } from 'element-plus'

const props = defineProps<{ items: readonly AuditEvent[] }>()
const currentPage = ref(1)
const pageSize = ref<number>(ADMIN_UI_DEFAULTS.pagination.pageSize)
const table = ref<TableInstance>()
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return props.items.slice(start, start + pageSize.value)
})

// 记录减少时保持有效页码，翻页和切换条数后回到表格顶部
watch([currentPage, pageSize, () => props.items.length], () => {
  const lastPage = Math.max(1, Math.ceil(props.items.length / pageSize.value))
  currentPage.value = Math.min(currentPage.value, lastPage)
  table.value?.setScrollTop(0)
})

/**
 * 格式化审计事件时间
 *
 * @param value - ISO 8601 时间
 * @returns 管理端日期时间文案
 */
function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<template>
  <ElTable
    v-if="items.length"
    ref="table"
    :data="pagedItems"
    max-height="min(480px, 60vh)"
    scrollbar-always-on
    table-layout="fixed"
  >
    <ElTableColumn label="时间" min-width="150"
      ><template #default="{ row }">{{ formatTime(row.occurredAt) }}</template></ElTableColumn
    >
    <ElTableColumn label="操作者" min-width="120" prop="actor" /><ElTableColumn
      label="动作"
      min-width="150"
      prop="action"
    />
    <ElTableColumn label="对象" min-width="180"
      ><template #default="{ row }"
        >{{ row.objectType }} · {{ row.objectId }}</template
      ></ElTableColumn
    >
    <ElTableColumn label="原因" min-width="180"
      ><template #default="{ row }">{{
        row.reason?.trim() ? row.reason : '-'
      }}</template></ElTableColumn
    ><ElTableColumn label="Request ID" min-width="200" prop="requestId" />
  </ElTable>
  <ElEmpty v-else description="暂无审计事件" />
  <AppPagination
    v-if="items.length"
    v-model:current-page="currentPage"
    v-model:page-size="pageSize"
    :total="items.length"
  />
</template>

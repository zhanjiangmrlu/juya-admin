<script setup lang="ts">
import dayjs from 'dayjs'

import type { AuditEvent } from '@/features/audit/audit-adapter'

defineProps<{ items: readonly AuditEvent[] }>()

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
  <ElTable v-if="items.length" :data="items" table-layout="fixed">
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
    <ElTableColumn label="原因" min-width="180" prop="reason" /><ElTableColumn
      label="Request ID"
      min-width="200"
      prop="requestId"
    />
  </ElTable>
  <ElEmpty v-else description="暂无审计事件" />
</template>

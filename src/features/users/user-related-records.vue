<script setup lang="ts">
import dayjs from 'dayjs'

defineProps<{ records: Record<string, Record<string, unknown>[]> }>()
const sections = [
  {
    key: 'formal_entitlements',
    title: '正式权益',
    fields: ['name', 'status', 'term', 'granted_at', 'expires_at'],
    route: 'formal-entitlement-action'
  },
  {
    key: 'limited_entitlements',
    title: '限时权益',
    fields: [
      'name',
      'campaign_version_id',
      'status',
      'start_deadline',
      'activated_at',
      'expires_at'
    ],
    route: 'limited-entitlement-action'
  },
  {
    key: 'feedback',
    title: '反馈记录',
    fields: ['category', 'description', 'status', 'created_at'],
    route: 'feedback-detail'
  },
  {
    key: 'deletions',
    title: '注销记录',
    fields: ['status', 'requested_at', 'effective_at', 'completed_at'],
    route: undefined
  },
  {
    key: 'audit',
    title: '操作审计',
    fields: ['action', 'actor_public_id', 'created_at', 'reason'],
    route: undefined
  }
]
const labels: Record<string, string> = {
  name: '内容包 / 活动',
  status: '状态',
  term: '期限',
  granted_at: '授予时间',
  expires_at: '到期时间',
  campaign_version_id: '活动版本',
  start_deadline: '启动期限',
  activated_at: '开始时间',
  category: '分类',
  description: '用户说明',
  created_at: '时间',
  requested_at: '申请时间',
  effective_at: '生效时间',
  completed_at: '完成时间',
  action: '操作',
  actor_public_id: '操作人',
  reason: '说明'
}
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
    <ElCard v-for="section in sections" :key="section.key" shadow="never">
      <template #header>{{ section.title }}</template>
      <ElTable :data="records[section.key] ?? []" empty-text="暂无记录">
        <ElTableColumn
          v-for="field in section.fields"
          :key="field"
          :label="labels[field]"
          min-width="150"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ display(field, row[field]) }}</template>
        </ElTableColumn>
        <ElTableColumn v-if="section.route" label="操作" width="80">
          <template #default="{ row }"
            ><RouterLink :to="{ name: section.route, params: { id: String(row.id) } }"
              >查看</RouterLink
            ></template
          >
        </ElTableColumn>
      </ElTable>
    </ElCard>
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

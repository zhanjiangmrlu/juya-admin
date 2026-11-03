<script setup lang="ts">
import { ElPagination, ElTable, ElTableColumn } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

const props = defineProps<{ userId: string; revision: number }>()
const page = ref(1)
const { data, busy, error, refresh } = useResource(() =>
  api.request<components['schemas']['AccessHistoryPage']>(
    `/api/admin/v1/users/${encodeURIComponent(props.userId)}/learning-authorization/history?page=${page.value}&limit=10`
  )
)
const actions: Record<string, string> = {
  grant: '开通一个月',
  renew: '续期一个月',
  set_expiry: '指定到期日',
  revoke: '撤销授权'
}
/** 显示审计时刻的真实状态及当时到期日
 * @param value 服务端保存的授权变更前或变更后快照
 * @returns 审计授权文案
 */
const stateText = (value: Record<string, unknown>) => {
  const label =
    value.status === 'active' ? '授权有效' : value.status === 'expired' ? '已到期' : '未授权'
  return value.expires_on ? `${label}，至 ${String(value.expires_on)}` : label
}
/** 切换授权审计页并读取该页
 * @param value 管理员选择的审计页码
 */
const turnPage = (value: number) => {
  page.value = value
  void refresh()
}
watch(
  () => props.revision,
  () => {
    page.value = 1
    void refresh()
  }
)
onMounted(refresh)
</script>
<template>
  <section id="authorization-history" class="panel authorization-history">
    <h2>最近授权操作</h2>
    <AppState
      element-plus
      :busy="busy"
      :error="error"
      :empty="data?.total === 0"
      empty-title="暂无授权操作"
      empty-text="真实授权变更会在此保留操作记录"
      @retry="refresh"
    />
    <div v-if="data && data.total && !busy && !error" class="table-wrap">
      <ElTable :data="data.items" row-key="id">
        <ElTableColumn label="操作时间" :min-width="173"
          ><template #default="{ row }">{{ dateText(row.occurred_at) }}</template></ElTableColumn
        >
        <ElTableColumn prop="admin_id" label="管理员" :min-width="130" />
        <ElTableColumn label="操作" :min-width="110"
          ><template #default="{ row }">{{
            actions[row.action] || row.action
          }}</template></ElTableColumn
        >
        <ElTableColumn label="变更前" :min-width="154"
          ><template #default="{ row }">{{ stateText(row.before) }}</template></ElTableColumn
        >
        <ElTableColumn label="变更后" :min-width="154"
          ><template #default="{ row }">{{ stateText(row.after) }}</template></ElTableColumn
        >
      </ElTable>
    </div>
    <ElPagination
      v-if="data && data.total > data.limit"
      class="history-pagination"
      :current-page="page"
      :page-size="data.limit"
      :total="data.total"
      :disabled="busy"
      layout="total, prev, pager, next"
      prev-text="上一页"
      next-text="下一页"
      @current-change="turnPage"
    />
    <p class="history-note">失败不提前改授权；超时先查询同次操作结果，续期重试不会重复加月。</p>
  </section>
</template>
<style scoped lang="scss">
.authorization-history {
  padding: 24px;
  margin-top: 20px;
  scroll-margin-top: 88px;

  h2 {
    margin-bottom: 18px;
  }

  :deep([class~='el-table__cell']) {
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  :deep(td[class~='el-table__cell']) {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .history-pagination {
    justify-content: flex-end;
    margin-top: 16px;
  }

  .history-note {
    margin-top: 12px;
    font-size: 11px;
    color: var(--muted);
  }
}
</style>

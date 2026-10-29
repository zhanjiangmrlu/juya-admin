<script setup lang="ts">
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
 * @param delta 前后翻页的页码增量
 */
const turnPage = (delta: number) => {
  page.value += delta
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
      :busy="busy"
      :error="error"
      :empty="data?.total === 0"
      empty-title="暂无授权操作"
      empty-text="真实授权变更会在此保留操作记录"
      @retry="refresh"
    />
    <div v-if="data && data.total && !busy && !error" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>操作时间</th>
            <th>管理员</th>
            <th>操作</th>
            <th>变更前</th>
            <th>变更后</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id">
            <td>{{ dateText(item.occurred_at) }}</td>
            <td>{{ item.admin_id }}</td>
            <td>{{ actions[item.action] || item.action }}</td>
            <td>{{ stateText(item.before) }}</td>
            <td>{{ stateText(item.after) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="data && data.total > data.limit" class="pagination">
      <button :disabled="page <= 1 || busy" @click="turnPage(-1)">上一页</button
      ><span>共 {{ data.total }} 条</span
      ><button :disabled="page * data.limit >= data.total || busy" @click="turnPage(1)">
        下一页
      </button>
    </div>
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

  table {
    table-layout: fixed;
    min-width: 720px;
  }

  th,
  td {
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  td {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  th:first-child {
    width: 24%;
  }

  .history-note {
    margin-top: 12px;
    font-size: 11px;
    color: var(--muted);
  }
}
</style>

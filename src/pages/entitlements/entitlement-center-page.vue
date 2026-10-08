<script setup lang="ts">
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_TABLE_COLUMNS, ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import DataTable from '@/components/data-table/data-table.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { useEntitlementList } from '@/features/entitlements/use-entitlement-list'
import { createApiClient } from '@/services/api/api-client'
import { formatDateTime } from '@/shared/utils/date-time'

import type { EntitlementFilters } from '@/features/entitlements/entitlement-query-adapter'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const filters = reactive<EntitlementFilters>({
  page: 1,
  pageSize: ADMIN_UI_DEFAULTS.pagination.pageSize as number,
  userId: '',
  type:
    route.query.type === 'LIMITED' || route.query.type === 'FORMAL' ? route.query.type : undefined,
  status: typeof route.query.status === 'string' ? route.query.status : undefined,
  expiry: route.query.expiry === 'EXPIRING' ? 'EXPIRING' : undefined
})
const controller = useEntitlementList(
  createEntitlementQueryAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      getCsrfToken: () => auth.csrfToken,
      onUnauthorized: () => {
        auth.clearSensitiveState()
        void router.replace({ name: 'login' })
      }
    })
  )
)
const statusLabels: Record<string, string> = {
  ACTIVE: '生效中',
  PAUSED: '已暂停',
  PENDING: '待启动',
  START_EXPIRED: '启动过期',
  ENDED: '已结束',
  REVOKED: '已撤销',
  EXPIRED: '已到期'
}
/**
 * 仅格式化服务端到期时间，不在前端推算权益状态。
 * @param value - 服务端时间或空值
 * @returns 可读的本地时间
 */
function displayTime(value: string | null): string {
  return formatDateTime(value, '永久 / 未设置')
}
/**
 * 按筛选条件重新加载第一页权益。
 * @returns 无返回值
 */
function search(): void {
  filters.page = 1
  void controller.load({ ...filters, userId: filters.userId?.trim() })
}
/**
 * 切换服务端分页。
 * @param page - 新页码
 * @returns 无返回值
 */
function changePage(page: number): void {
  filters.page = page
  void controller.load({ ...filters })
}
void controller.load({ ...filters })
</script>

<template>
  <section class="entitlement-center-page">
    <div class="page-toolbar">
      <div class="heading">
        <div>
          <p>正式包与限时包在同一中心管理，筛选到期和待开始状态。</p>
        </div>
        <div class="actions">
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'formal-entitlement-grant' }"
            ><ElButton type="primary" @click="navigate">授予正式权益</ElButton></RouterLink
          ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'limited-entitlement-grant' }"
            ><ElButton @click="navigate">开通限时权益</ElButton></RouterLink
          >
        </div>
      </div>
    </div>
    <ElForm class="filters" @submit.prevent="search">
      <ElInput v-model="filters.userId" aria-label="用户编号" placeholder="用户编号" clearable />
      <ElSelect v-model="filters.type" aria-label="权益类型" placeholder="全部类型" clearable
        ><ElOption label="正式包" value="FORMAL" /><ElOption label="限时包" value="LIMITED"
      /></ElSelect>
      <ElSelect v-model="filters.status" aria-label="权益状态" placeholder="全部状态" clearable
        ><ElOption
          v-for="status in [
            'ACTIVE',
            'PAUSED',
            'PENDING',
            'START_EXPIRED',
            'ENDED',
            'REVOKED',
            'EXPIRED'
          ]"
          :key="status"
          :label="statusLabels[status]"
          :value="status"
      /></ElSelect>
      <ElInput
        v-model="filters.campaignVersionId"
        aria-label="活动版本"
        placeholder="活动版本编号"
        clearable
      />
      <ElSelect v-model="filters.expiry" aria-label="临近期限" placeholder="全部期限" clearable>
        <ElOption label="正式权益即将到期" value="EXPIRING" /><ElOption
          label="限时学习24小时内结束"
          value="ENDING"
        /><ElOption label="待开始24小时内失效" value="START_EXPIRING" />
      </ElSelect>
      <ElDatePicker
        v-model="filters.dateFrom"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="授予开始日期"
        aria-label="授予开始日期"
      />
      <ElDatePicker
        v-model="filters.dateTo"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="授予结束日期"
        aria-label="授予结束日期"
      />
      <ElButton native-type="submit" type="primary">查询</ElButton>
      <RouterLink to="/settings">配置正式权益预警天数</RouterLink>
    </ElForm>
    <ElSkeleton
      v-if="controller.state.value === 'loading'"
      :rows="5"
      animated
      aria-label="正在加载权益列表"
    />
    <ElAlert
      v-else-if="controller.state.value === 'error'"
      :title="controller.error.value ?? ''"
      type="error"
      :closable="false"
      show-icon
      ><ApiErrorDetails :error="controller.apiError.value" /><ElButton
        @click="controller.load({ ...filters })"
        >重试</ElButton
      ></ElAlert
    >
    <ElEmpty
      v-else-if="controller.state.value === 'empty'"
      description="当前筛选条件下没有权益记录。可调整筛选条件后重新查询。"
    />
    <template v-else>
      <AdminPanel class="table-card"
        ><DataTable
          :columns="ADMIN_TABLE_COLUMNS.entitlements"
          :rows="controller.page.value.items"
          class="data-table"
        >
          <template #user="{ row }"
            ><div class="cell-stack">
              <strong>{{ row.nickname || '未设置昵称' }}</strong
              ><span>{{ row.juyaNumber || row.userId }}</span>
            </div></template
          >
          <template #contact="{ row }"
            ><div class="cell-stack">
              <span>{{ row.contactDegraded ? '联系资料暂不可用' : row.wechatId || '未填写' }}</span
              ><small>{{ row.contactStatus }}</small>
            </div></template
          >
          <template #type="{ row }">{{ row.type === 'FORMAL' ? '正式包' : '限时包' }}</template>
          <template #package="{ row }"
            ><div class="cell-stack">
              <span>{{ row.contentName || row.packageId || row.campaignId || '—' }}</span
              ><small
                >{{ row.campaignVersionNo ? '第 ' + row.campaignVersionNo + ' 版' : '—'
                }}<span v-if="row.campaignVersionId"> · {{ row.campaignVersionId }}</span></small
              >
            </div></template
          >
          <template #status="{ row }">{{ statusLabels[row.status] ?? row.status }}</template>
          <template #expires="{ row }"
            ><div class="cell-stack">
              <span>档位：{{ row.term === 'permanent' ? '永久' : row.term || '—' }}</span
              ><small>生效：{{ row.effectiveAt ? displayTime(row.effectiveAt) : '尚未开始' }}</small
              ><small>启动：{{ row.startDeadline ? displayTime(row.startDeadline) : '—' }}</small
              ><small>到期：{{ displayTime(row.expiresAt) }}</small>
            </div></template
          >
          <template #actions="{ row }"
            ><RouterLink
              :to="{
                name:
                  row.type === 'FORMAL'
                    ? 'formal-entitlement-action'
                    : 'limited-entitlement-action',
                params: { id: row.id }
              }"
              >查看</RouterLink
            ></template
          >
        </DataTable></AdminPanel
      >
    </template>
    <AppPagination
      v-model:current-page="filters.page"
      v-model:page-size="filters.pageSize"
      :total="controller.page.value.total"
      :disabled="controller.state.value === 'loading'"
      @change="changePage"
    />
    <aside class="management-note">
      <strong>操作说明</strong>
      <p>正式包授予与延期选择 1、2、3、6、12 个月或永久，并二次核对新到期时间。</p>
    </aside>
  </section>
</template>

<style scoped lang="scss">
.entitlement-center-page {
  min-width: 0;

  .page-toolbar {
    margin-bottom: 18px;
  }

  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .heading p {
    margin: 0;
    color: #657a68;
    font-size: 13px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .actions .el-button {
    margin-left: 0;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 14px 16px;
    flex-wrap: wrap;
    margin-bottom: 22px;
    padding: 18px;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #eaf2e3;
  }

  .filters .el-input {
    width: 240px;
  }

  .filters .el-select {
    width: 155px;
  }

  .filters :deep(.el-date-editor) {
    width: 190px;
  }

  .filters a {
    color: #4e7f3b;
    font-size: 13px;
  }

  .table-card {
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
  }

  .table-card :deep([class~='el-card__body']) {
    padding: 0;
  }

  .cell-stack {
    display: grid;
    gap: 4px;
    overflow-wrap: anywhere;
  }

  .cell-stack strong {
    font-weight: 500;
  }

  .cell-stack small {
    color: #657a68;
    font-size: 11px;
  }

  .data-table {
    width: 100%;

    --el-table-header-bg-color: #e8f0e1;
    --el-table-tr-bg-color: #fffdf7;
    --el-table-border-color: #d8e5d1;

    color: #244633;
  }

  .data-table :deep(th[class~='el-table__cell']) {
    height: 42px;
    color: #244633;
    font-size: 13px;
  }

  .data-table :deep(td[class~='el-table__cell']) {
    height: 58px;
    font-size: 13px;
  }

  .data-table :deep(a) {
    color: #4e7f3b;
  }

  .management-note {
    margin-top: 18px;
    padding: 16px;
    border-radius: 16px;
    background: #e5f0dc;
    color: #244633;
  }

  .management-note strong {
    color: #4e7f3b;
    font-size: 14px;
  }

  .management-note p {
    margin: 20px 0 6px;
    font-size: 13px;
    line-height: 1.7;
  }
}

@media (width <= 1000px) {
  .entitlement-center-page .heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
}
</style>

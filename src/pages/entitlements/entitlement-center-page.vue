<script setup lang="ts">
import dayjs from 'dayjs'
import { reactive } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { useEntitlementList } from '@/features/entitlements/use-entitlement-list'
import { createApiClient } from '@/services/api/api-client'

import type { EntitlementFilters } from '@/features/entitlements/entitlement-query-adapter'

const router = useRouter()
const auth = useAuthStore()
const filters = reactive<EntitlementFilters>({
  page: 1,
  userId: '',
  type: undefined,
  status: undefined
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
  REVOKED: '已撤销'
}
/**
 * 仅格式化服务端到期时间，不在前端推算权益状态。
 * @param value - 服务端时间或空值
 * @returns 可读的本地时间
 */
function displayTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '永久 / 未设置'
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
    <ElCard shadow="never">
      <template #header>
        <div class="heading">
          <div>
            <span>A05</span>
            <h2>统一权益中心</h2>
          </div>
          <div class="actions">
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'formal-entitlement-grant' }"
              ><ElButton type="primary" @click="navigate">授予正式权益</ElButton></RouterLink
            ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'limited-entitlement-grant' }"
              ><ElButton @click="navigate">开通限时权益</ElButton></RouterLink
            >
          </div>
        </div>
      </template>
      <ElForm class="filters" @submit.prevent="search">
        <ElInput v-model="filters.userId" aria-label="用户编号" placeholder="用户编号" clearable />
        <ElSelect v-model="filters.type" aria-label="权益类型" placeholder="全部类型" clearable
          ><ElOption label="正式包" value="FORMAL" /><ElOption label="限时包" value="LIMITED"
        /></ElSelect>
        <ElSelect v-model="filters.status" aria-label="权益状态" placeholder="全部状态" clearable
          ><ElOption
            v-for="status in ['ACTIVE', 'PAUSED', 'PENDING', 'START_EXPIRED', 'ENDED', 'REVOKED']"
            :key="status"
            :label="statusLabels[status]"
            :value="status"
        /></ElSelect>
        <ElButton native-type="submit" type="primary">查询</ElButton>
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
        ><ElButton size="small" @click="controller.load({ ...filters })">重试</ElButton></ElAlert
      >
      <ElEmpty
        v-else-if="controller.state.value === 'empty'"
        description="当前筛选条件下没有权益记录。可调整筛选条件后重新查询。"
      />
      <template v-else>
        <ElTable :data="controller.page.value.items" class="data-table" stripe>
          <ElTableColumn prop="id" label="权益编号" min-width="145" show-overflow-tooltip />
          <ElTableColumn prop="userId" label="用户编号" min-width="125" show-overflow-tooltip />
          <ElTableColumn label="类型" width="90"
            ><template #default="scope">{{
              scope.row.type === 'FORMAL' ? '正式包' : '限时包'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="状态" width="105"
            ><template #default="scope">{{
              statusLabels[scope.row.status] ?? scope.row.status
            }}</template></ElTableColumn
          >
          <ElTableColumn label="内容包 / 活动" min-width="145" show-overflow-tooltip
            ><template #default="scope">{{
              scope.row.packageId ?? scope.row.campaignId ?? '—'
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="expiresAt" label="到期时间" min-width="150"
            ><template #default="scope">{{
              displayTime(scope.row.expiresAt)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="操作" width="75"
            ><template #default="scope"
              ><RouterLink
                :to="{
                  name:
                    scope.row.type === 'FORMAL'
                      ? 'formal-entitlement-action'
                      : 'limited-entitlement-action',
                  params: { id: scope.row.id }
                }"
                >查看</RouterLink
              ></template
            ></ElTableColumn
          >
        </ElTable>
      </template>
      <ElPagination
        v-if="controller.page.value.total > 20"
        class="pagination"
        :current-page="controller.page.value.page"
        :page-size="controller.page.value.pageSize"
        :total="controller.page.value.total"
        layout="prev, pager, next, total"
        @current-change="changePage"
      />
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.entitlement-center-page {
  min-width: 0;

  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  .actions,
  .filters {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filters {
    margin-bottom: 18px;
  }

  .filters .el-input {
    width: 230px;
  }

  .filters .el-select {
    width: 155px;
  }

  .data-table {
    width: 100%;
  }

  .pagination {
    margin-top: 16px;
    justify-content: flex-end;
  }
}
</style>

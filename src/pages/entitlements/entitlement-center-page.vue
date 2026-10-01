<script setup lang="ts">
import dayjs from 'dayjs'
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { useEntitlementList } from '@/features/entitlements/use-entitlement-list'
import { createApiClient } from '@/services/api/api-client'

import type { EntitlementFilters } from '@/features/entitlements/entitlement-query-adapter'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const filters = reactive<EntitlementFilters>({
  page: 1,
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
          size="small"
          @click="controller.load({ ...filters })"
          >重试</ElButton
        ></ElAlert
      >
      <ElEmpty
        v-else-if="controller.state.value === 'empty'"
        description="当前筛选条件下没有权益记录。可调整筛选条件后重新查询。"
      />
      <template v-else>
        <ElTable :data="controller.page.value.items" class="data-table" stripe>
          <ElTableColumn prop="id" label="权益编号" min-width="145" show-overflow-tooltip />
          <ElTableColumn label="用户 / 句芽编号" min-width="160"
            ><template #default="{ row }"
              >{{ row.nickname || '未设置昵称' }} · {{ row.juyaNumber || row.userId }}</template
            ></ElTableColumn
          >
          <ElTableColumn label="微信号 / 联系状态" min-width="170"
            ><template #default="{ row }"
              >{{ row.contactDegraded ? '联系资料暂不可用' : row.wechatId || '未填写' }} ·
              {{ row.contactStatus }}</template
            ></ElTableColumn
          >
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
              scope.row.contentName || scope.row.packageId || scope.row.campaignId || '—'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="活动版本" min-width="130"
            ><template #default="{ row }"
              >{{ row.campaignVersionNo ? `第 ${row.campaignVersionNo} 版` : '—'
              }}<span v-if="row.campaignVersionId"> · {{ row.campaignVersionId }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="期限档位" min-width="110"
            ><template #default="{ row }">{{
              row.term === 'permanent' ? '永久' : row.term
            }}</template></ElTableColumn
          >
          <ElTableColumn label="生效时间" min-width="150"
            ><template #default="{ row }">{{
              row.effectiveAt ? displayTime(row.effectiveAt) : '尚未开始'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="启动期限" min-width="150"
            ><template #default="{ row }">{{
              row.startDeadline ? displayTime(row.startDeadline) : '—'
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
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
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

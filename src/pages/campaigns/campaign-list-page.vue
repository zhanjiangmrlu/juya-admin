<script setup lang="ts">
import { reactive, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { CampaignPage } from '@/features/campaigns/campaign-adapter'

const router = useRouter()
const auth = useAuthStore()
const adapter = createCampaignAdapter(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    getCsrfToken: () => auth.csrfToken,
    onUnauthorized: () => {
      auth.clearSensitiveState()
      void router.replace({ name: 'login' })
    }
  })
)
const filters = reactive({ page: 1, pageSize: 10, status: '' })
const page = ref<CampaignPage>({ items: [], page: 1, pageSize: 10, total: 0 })
const state = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const error = ref('')
const apiError = shallowRef<ApiError | null>(null)
let requestSequence = 0
/**
 * 加载服务端活动分页。
 * @returns 活动列表加载完成后的 Promise
 */
async function load(): Promise<void> {
  const sequence = ++requestSequence
  state.value = 'loading'
  error.value = ''
  apiError.value = null
  try {
    const result = await adapter.list(filters.page, filters.status || undefined, filters.pageSize)
    if (sequence !== requestSequence) return
    page.value = result
    state.value = page.value.items.length ? 'success' : 'empty'
  } catch (failure) {
    if (sequence !== requestSequence) return
    state.value = 'error'
    apiError.value = failure instanceof ApiError ? failure : null
    error.value = failure instanceof ApiError ? failure.message : '活动列表加载失败，请重试'
  }
}
/**
 * 切换服务端分页。
 * @param next - 新页码
 * @returns 无返回值
 */
function changePage(next: number): void {
  filters.page = next
  void load()
}
void load()
</script>

<template>
  <section class="campaign-page">
    <p class="page-context">活动按版本发布；首次开通后部分字段锁定，容量仍可调整。</p>
    <div class="filters">
      <ElFormItem label="活动状态">
        <ElSelect
          v-model="filters.status"
          aria-label="活动状态"
          placeholder="全部状态"
          clearable
          @change="changePage(1)"
        >
          <ElOption
            v-for="status in ['DRAFT', 'OPEN', 'PAUSED', 'ENDED', 'ARCHIVED', 'CLOSED']"
            :key="status"
            :value="status"
            :label="
              {
                DRAFT: '草稿',
                OPEN: '已启用',
                PAUSED: '已暂停',
                ENDED: '已结束',
                ARCHIVED: '已归档',
                CLOSED: '已关闭'
              }[status as 'DRAFT']
            "
          />
        </ElSelect>
      </ElFormItem>
      <ElButton @click="load">刷新</ElButton>
      <RouterLink
        v-slot="{ navigate }"
        custom
        class="create-link"
        :to="{ name: 'campaign-edit', params: { id: 'new' } }"
      >
        <ElButton type="primary" @click="navigate">新建活动</ElButton>
      </RouterLink>
    </div>
    <ElCard shadow="never" class="table-card">
      <ElSkeleton v-if="state === 'loading'" :rows="5" animated aria-label="正在加载活动" />
      <ElAlert
        v-else-if="state === 'error'"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      >
        <ApiErrorDetails :error="apiError" /><ElButton size="small" @click="load">重试</ElButton>
      </ElAlert>
      <ElEmpty
        v-else-if="state === 'empty'"
        description="暂无活动。可以新建活动，或清除状态筛选。"
      />
      <ElTable v-else :data="page.items" class="data-table">
        <ElTableColumn prop="name" label="活动" min-width="200" show-overflow-tooltip />
        <ElTableColumn prop="id" label="活动编号" min-width="150" show-overflow-tooltip />
        <ElTableColumn label="版本" width="90"
          ><template #default="{ row }">v{{ row.version }}</template></ElTableColumn
        >
        <ElTableColumn label="开通人数 / 容量" min-width="160"
          ><template #default="{ row }"
            >{{ row.grantedUserCount ?? '—' }} / {{ row.capacity ?? '—' }}</template
          ></ElTableColumn
        >
        <ElTableColumn prop="status" label="状态" width="100"
          ><template #default="{ row }">{{
            {
              DRAFT: '草稿',
              OPEN: '已启用',
              PAUSED: '已暂停',
              ENDED: '已结束',
              ARCHIVED: '已归档',
              CLOSED: '已关闭'
            }[row.status as 'DRAFT'] ?? row.status
          }}</template></ElTableColumn
        >
        <ElTableColumn label="操作" width="180"
          ><template #default="scope">
            <RouterLink :to="{ name: 'campaign-edit', params: { id: scope.row.id } }"
              >编辑</RouterLink
            >
            <RouterLink
              class="link"
              :to="{ name: 'campaign-versions', params: { id: scope.row.id } }"
              >版本与容量</RouterLink
            >
          </template></ElTableColumn
        >
      </ElTable>
      <AppPagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="page.total"
        :disabled="state === 'loading'"
        @change="changePage"
      />
    </ElCard>
    <aside class="notice">
      <strong>操作说明</strong>
      <p>活动支持草稿、启用、暂停、恢复、结束、复制和归档；保留版本记录。</p>
    </aside>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.campaign-page {
  min-width: 0;
  color: var(--juya-color-text-primary);

  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  .page-context {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-text-primary);
    font-size: 20px;
    line-height: 28px;
  }

  .panel-subtitle {
    margin: 8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .notice {
    padding: 16px;
    border-radius: 16px;
    background: #e5f0dc;
    font-size: 13px;
    line-height: 1.8;
  }

  .notice strong {
    color: #4e7f3b;
    font-size: 14px;
  }

  .notice p {
    margin: 20px 0 0;
  }

  :deep(.el-card) {
    border-color: #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
    box-shadow: none;
  }

  :deep(.el-card__header) {
    padding: 16px 20px 12px;
    border-bottom: 0;
  }

  :deep(.el-card__body) {
    padding: 20px;
  }

  :deep(.el-button) {
    min-height: 38px;
    border-radius: 10px;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper),
  :deep(.el-textarea__inner) {
    border-radius: 10px;
    background: #fffdf7;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 96px;
    padding: 16px 20px;
    margin: 18px 0 22px;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #eaf2e3;
  }

  .filters :deep(.el-form-item) {
    display: block;
    margin: 0;
  }

  .filters :deep(.el-form-item__label) {
    display: block;
    height: 24px;
    line-height: 24px;
  }

  .filters :deep(.el-select) {
    width: 220px;
  }

  .filters :deep(.el-button:last-child) {
    margin-left: auto;
    min-width: 150px;
  }

  .table-card {
    overflow: hidden;
    margin-bottom: 24px;
  }

  .table-card :deep(.el-card__body) {
    padding: 0 0 16px;
  }

  :deep(.app-pagination) {
    padding-inline: 20px;
  }

  .data-table {
    width: 100%;

    --el-table-header-bg-color: #e8f0e1;
  }

  .data-table :deep(th.el-table__cell) {
    height: 42px;
    font-size: 13px;
  }

  .data-table :deep(td.el-table__cell) {
    height: 58px;
    font-size: 13px;
  }

  .data-table :deep(.cell) {
    padding-inline: 16px;
  }

  .link {
    margin-left: 12px;
  }

  @media (width <= 700px) {
    .filters {
      flex-wrap: wrap;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

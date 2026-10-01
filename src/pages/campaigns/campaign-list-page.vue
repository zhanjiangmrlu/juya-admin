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
    <ElCard shadow="never">
      <template #header
        ><div class="heading">
          <div>
            <span>A10</span>
            <h2>限时活动列表</h2>
          </div>
          <RouterLink
            v-slot="{ navigate }"
            custom
            :to="{ name: 'campaign-edit', params: { id: 'new' } }"
            ><ElButton type="primary" @click="navigate">新建活动</ElButton></RouterLink
          >
        </div></template
      >
      <div class="filters">
        <ElSelect
          v-model="filters.status"
          aria-label="活动状态"
          placeholder="全部状态"
          clearable
          @change="changePage(1)"
          ><ElOption
            v-for="status in ['DRAFT', 'OPEN', 'PAUSED', 'ENDED', 'ARCHIVED', 'CLOSED']"
            :key="status"
            :value="status"
            :label="status" /></ElSelect
        ><ElButton @click="load">刷新</ElButton>
      </div>
      <ElSkeleton v-if="state === 'loading'" :rows="5" animated aria-label="正在加载活动" />
      <ElAlert v-else-if="state === 'error'" :title="error" type="error" :closable="false" show-icon
        ><ApiErrorDetails :error="apiError" /><ElButton size="small" @click="load"
          >重试</ElButton
        ></ElAlert
      >
      <ElEmpty
        v-else-if="state === 'empty'"
        description="暂无活动。可以新建活动，或清除状态筛选。"
      />
      <ElTable v-else :data="page.items" stripe class="data-table"
        ><ElTableColumn
          prop="id"
          label="活动编号"
          min-width="180"
          show-overflow-tooltip
        /><ElTableColumn
          prop="name"
          label="活动名称"
          min-width="200"
          show-overflow-tooltip
        /><ElTableColumn prop="status" label="状态" width="110" /><ElTableColumn
          prop="capacity"
          label="容量"
          width="100"
          ><template #default="scope">{{ scope.row.capacity ?? '—' }}</template></ElTableColumn
        ><ElTableColumn prop="grantedUserCount" label="已开通" width="100"
          ><template #default="scope">{{
            scope.row.grantedUserCount ?? '—'
          }}</template></ElTableColumn
        ><ElTableColumn label="操作" width="160"
          ><template #default="scope"
            ><RouterLink :to="{ name: 'campaign-edit', params: { id: scope.row.id } }"
              >编辑</RouterLink
            ><RouterLink
              class="link"
              :to="{ name: 'campaign-versions', params: { id: scope.row.id } }"
              >版本与容量</RouterLink
            ></template
          ></ElTableColumn
        ></ElTable
      >
      <AppPagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="page.total"
        :disabled="state === 'loading'"
        @change="changePage"
      />
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.campaign-page {
  min-width: 0;

  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
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

  .filters {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }

  .filters .el-select {
    width: 160px;
  }

  .data-table {
    width: 100%;
  }

  .link {
    margin-left: 12px;
  }
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_TABLE_COLUMNS, ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'
import AdminNotice from '@/components/admin-notice/admin-notice.vue'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import DataTable from '@/components/data-table/data-table.vue'
import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFeedbackAdapter } from '@/features/feedback/feedback-adapter'
import { FEEDBACK_STATUS_LABELS } from '@/features/feedback/feedback-copy'
import { useFeedbackList } from '@/features/feedback/use-feedback-list'
import { createApiClient } from '@/services/api/api-client'
import { formatDateTime } from '@/shared/utils/date-time'

import type {
  FeedbackCategory,
  FeedbackFilters,
  FeedbackSlaState
} from '@/features/feedback/feedback-adapter'
import type { FeedbackStatus } from '@/features/feedback/feedback-model'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const filters = reactive({
  category: readQuery('category'),
  keyword: readQuery('keyword'),
  page: readPage(),
  pageSize: ADMIN_UI_DEFAULTS.pagination.pageSize as number,
  sla: readQuery('sla'),
  status: readQuery('status')
})
const controller = useFeedbackList(
  createFeedbackAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      onUnauthorized: () => {
        authStore.clearSensitiveState()
        void router.replace({ name: 'login' })
      }
    })
  )
)

const categoryLabels: Record<FeedbackCategory, string> = {
  CONTENT: '内容问题',
  DISPLAY: '显示问题',
  FUNCTION: '功能问题',
  PRONUNCIATION: '发音问题'
}
const slaLabels: Record<FeedbackSlaState, string> = {
  URGENT: '紧急待办',
  COMPLETED: '已结束',
  DUE_SOON: '即将超时',
  ON_TRACK: '时限正常',
  OVERDUE: '已超时',
  PAUSED: '等待用户'
}

onMounted(() => void load())
onBeforeUnmount(controller.dispose)

/**
 * 从当前路由读取单值筛选参数。
 * @param key - 查询参数名称
 * @returns 参数字符串或空字符串
 */
function readQuery(key: string): string {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 读取并校验路由页码。
 * @returns 路由中的有效页码
 */
function readPage(): number {
  const value = Number(readQuery('page'))
  return Number.isInteger(value) && value > 0 ? value : 1
}

/**
 * 规范化当前反馈筛选表单。
 * @returns 当前表单对应的反馈查询参数
 */
function currentFilters(): FeedbackFilters {
  return {
    category: (filters.category || undefined) as FeedbackCategory | undefined,
    keyword: filters.keyword.trim() || undefined,
    page: filters.page,
    pageSize: filters.pageSize,
    sla: (filters.sla || undefined) as FeedbackSlaState | undefined,
    status: (filters.status || undefined) as FeedbackStatus | undefined
  }
}

/** 同步可恢复筛选到路由并加载服务端分页。 */
async function load(): Promise<void> {
  const next = currentFilters()
  await router.replace({
    query: {
      category: next.category,
      keyword: next.keyword,
      page: filters.page > 1 ? String(filters.page) : undefined,
      sla: next.sla,
      status: next.status
    }
  })
  await controller.load(next)
}

/** 从第一页提交当前筛选。 */
function submitFilters(): void {
  filters.page = 1
  void load()
}

/**
 * 切换服务端页码。
 * @param page - 目标页码
 */
function changePage(page: number): void {
  filters.page = page
  void load()
}

/**
 * 返回反馈状态标签色调。
 * @param status - 当前反馈状态
 * @returns 状态标签色调
 */
function statusTone(status: FeedbackStatus): 'danger' | 'info' | 'success' | 'warning' {
  if (status === 'RESOLVED') return 'success'
  if (status === 'PENDING') return 'danger'
  if (status === 'NEED_MORE' || status === 'USER_SUPPLIED') return 'warning'
  return 'info'
}
</script>

<template>
  <section class="feedback-list-page admin-operations-surface">
    <p class="page-context">按剩余处理时限排序，补充后重新计算 48 小时。</p>
    <AdminPanel class="list-card">
      <ElForm class="filter-bar" aria-label="反馈筛选" @submit.prevent="submitFilters">
        <ElInput v-model="filters.keyword" clearable placeholder="反馈编号或用户编号" />
        <ElSelect
          v-model="filters.status"
          aria-label="反馈状态筛选"
          clearable
          placeholder="全部状态"
        >
          <ElOption
            v-for="(label, value) in FEEDBACK_STATUS_LABELS"
            :key="value"
            :label="label"
            :value="value"
          />
        </ElSelect>
        <ElSelect
          v-model="filters.category"
          aria-label="反馈分类筛选"
          clearable
          placeholder="全部分类"
        >
          <ElOption
            v-for="(label, value) in categoryLabels"
            :key="value"
            :label="label"
            :value="value"
          />
        </ElSelect>
        <ElSelect v-model="filters.sla" aria-label="反馈时限筛选" clearable placeholder="全部时限">
          <ElOption
            v-for="(label, value) in slaLabels"
            :key="value"
            :label="label"
            :value="value"
          />
        </ElSelect>
        <ElButton native-type="submit" type="primary">查询</ElButton>
        <ElButton class="export-button" disabled type="primary">导出反馈</ElButton>
      </ElForm>

      <ElSkeleton v-if="controller.isLoading.value" :rows="6" animated aria-label="正在加载反馈" />
      <ElAlert
        v-else-if="controller.error.value"
        :closable="false"
        :title="controller.error.value"
        type="error"
        show-icon
      >
        <ApiErrorDetails :error="controller.apiError.value" />
        <ElButton size="small" @click="load">重试</ElButton>
      </ElAlert>
      <ElEmpty
        v-else-if="controller.page.value.items.length === 0"
        description="没有符合条件的反馈，请调整筛选条件。"
      />
      <DataTable
        v-else
        :columns="ADMIN_TABLE_COLUMNS.feedback"
        :rows="controller.page.value.items"
        class="feedback-table"
      >
        <template #details="{ row }"
          ><ElDescriptions :column="2" class="row-details">
            <ElDescriptionsItem label="提交时间">{{
              formatDateTime(row.createdAt)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="最近补充时间">{{
              formatDateTime(row.suppliedAt, '未补充')
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="更新时间">{{
              formatDateTime(row.updatedAt)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="反馈分类">{{
              categoryLabels[row.category as FeedbackCategory]
            }}</ElDescriptionsItem>
          </ElDescriptions></template
        >
        <template #subject="{ row }">
          <strong>{{ row.title }} · {{ categoryLabels[row.category as FeedbackCategory] }}</strong>
          <PlainTextContent
            v-if="row.description !== row.title"
            class="description-cell"
            :content="row.description"
          />
          <RouterLink
            :to="{ name: 'feedback-detail', params: { id: row.id }, query: route.query }"
            >{{ row.id }}</RouterLink
          >
        </template>

        <template #source="{ row }"
          >{{ row.source?.page || '未记录页面' }} ·
          {{ row.source?.scene_id || row.source?.sceneId || '未关联场景' }}</template
        >
        <template #screenshot="{ row }">{{
          row.screenshotStatus === 'NONE'
            ? '未附截图'
            : row.screenshotStatus === 'DELETED'
              ? '已删除'
              : row.screenshotStatus
        }}</template>
        <template #status="scope">
          <StatusTag
            :label="FEEDBACK_STATUS_LABELS[scope.row.status as FeedbackStatus]"
            :tone="statusTone(scope.row.status as FeedbackStatus)"
          />
        </template>
        <template #sla="scope">
          <ElTag
            :type="
              scope.row.slaState === 'OVERDUE'
                ? 'danger'
                : scope.row.slaState === 'DUE_SOON'
                  ? 'warning'
                  : 'info'
            "
            effect="plain"
          >
            {{ slaLabels[scope.row.slaState as FeedbackSlaState] }}
          </ElTag>
        </template>
        <template #actions="{ row }"
          ><RouterLink :to="{ name: 'feedback-detail', params: { id: row.id }, query: route.query }"
            >查看</RouterLink
          ></template
        >
      </DataTable>

      <AppPagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="controller.page.value.total"
        :disabled="controller.isLoading.value"
        @change="changePage"
      />
    </AdminPanel>
    <AdminNotice class="notice" title="操作说明">
      <p>反馈关闭后截图保留 30 天；7 天内可重开。</p>
    </AdminNotice>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.feedback-list-page {
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

  .list-card {
    margin: 18px 0 24px;
    overflow: hidden;
  }

  .list-card :deep(.el-card__body) {
    padding: 0 0 16px;
  }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(190px, 1fr) repeat(3, minmax(100px, 140px)) auto auto;
    align-items: center;
    gap: 12px;
    min-height: 96px;
    padding: 20px;
    margin-bottom: 22px;
    border-bottom: 1px solid #d8e5d1;
    background: #eaf2e3;
  }

  .feedback-table {
    width: 100%;

    --el-table-header-bg-color: #e8f0e1;
  }

  .feedback-table :deep(th.el-table__cell) {
    height: 42px;
    font-size: 13px;
  }

  .feedback-table :deep(td.el-table__cell) {
    min-height: 58px;
    padding-block: 16px;
    font-size: 13px;
  }

  .feedback-table strong {
    font-weight: 500;
  }

  .feedback-table :deep(.cell > a) {
    display: block;
    font-size: 12px;
  }

  .description-cell {
    max-width: 44ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-details {
    padding: 16px 24px;
  }

  :deep(.app-pagination) {
    padding-inline: 20px;
  }

  @media (width <= 1200px) {
    .filter-bar {
      grid-template-columns: minmax(190px, 1fr) repeat(3, minmax(100px, 1fr));
    }

    .export-button {
      justify-self: end;
      grid-column: 4;
    }
  }

  @media (width <= 700px) {
    .filter-bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .export-button {
      grid-column: 2;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

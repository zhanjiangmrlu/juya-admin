<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
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
  pageSize: 10,
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
  <section class="feedback-list-page">
    <ElCard shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <span class="page-number">A14</span>
            <h2>问题反馈列表</h2>
          </div>
          <ElButton disabled type="primary">导出反馈</ElButton>
        </div>
      </template>

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
      <ElTable v-else :data="controller.page.value.items" stripe class="feedback-table">
        <ElTableColumn label="反馈编号" min-width="112">
          <template #default="scope">
            <RouterLink
              :to="{ name: 'feedback-detail', params: { id: scope.row.id }, query: route.query }"
            >
              {{ scope.row.id }}
            </RouterLink>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="userId" label="用户编号" min-width="112" show-overflow-tooltip />
        <ElTableColumn label="反馈标题 / 说明" min-width="210">
          <template #default="scope">
            <strong>{{ scope.row.title }}</strong>
            <PlainTextContent
              v-if="scope.row.description !== scope.row.title"
              class="description-cell"
              :content="scope.row.description"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="自动来源" min-width="180"
          ><template #default="{ row }"
            >{{ row.source?.page || '未记录页面' }} ·
            {{ row.source?.scene_id || row.source?.sceneId || '未关联场景' }}</template
          ></ElTableColumn
        >
        <ElTableColumn label="截图状态" min-width="100"
          ><template #default="{ row }">{{
            row.screenshotStatus === 'NONE'
              ? '未附截图'
              : row.screenshotStatus === 'DELETED'
                ? '已删除'
                : row.screenshotStatus
          }}</template></ElTableColumn
        >
        <ElTableColumn label="提交时间" min-width="150"
          ><template #default="{ row }">{{
            formatDateTime(row.createdAt)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="最近补充时间" min-width="150"
          ><template #default="{ row }">{{
            formatDateTime(row.suppliedAt, '未补充')
          }}</template></ElTableColumn
        >
        <ElTableColumn label="分类" width="96">
          <template #default="scope">{{
            categoryLabels[scope.row.category as FeedbackCategory]
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="108">
          <template #default="scope">
            <StatusTag
              :label="FEEDBACK_STATUS_LABELS[scope.row.status as FeedbackStatus]"
              :tone="statusTone(scope.row.status as FeedbackStatus)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="处理时限" width="108">
          <template #default="scope">
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
        </ElTableColumn>
        <ElTableColumn label="更新时间" width="180">
          <template #default="scope">{{ formatDateTime(scope.row.updatedAt) }}</template>
        </ElTableColumn>
      </ElTable>

      <AppPagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="controller.page.value.total"
        :disabled="controller.isLoading.value"
        @change="changePage"
      />
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.feedback-list-page {
  min-width: 0;

  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .page-number {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(190px, 1fr) repeat(3, 150px) auto;
    gap: 10px;
    margin-bottom: 16px;
  }

  .feedback-table {
    width: 100%;
  }

  .description-cell {
    max-width: 44ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width <= 1050px) {
    .filter-bar {
      grid-template-columns: minmax(190px, 1fr) repeat(2, 145px) auto;

      :deep(.el-select:nth-of-type(4)) {
        grid-column: 1 / 2;
      }
    }
  }
}
</style>

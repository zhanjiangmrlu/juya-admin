<script setup lang="ts">
import {
  ElButton,
  ElForm,
  ElInput,
  ElLink,
  ElPagination,
  ElTable,
  ElTableColumn,
  ElTag
} from 'element-plus'
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText, queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/shared/constants/feedback'

import type { FeedbackPage, FeedbackStatus } from '@/shared/types/feedback'

defineOptions({ name: 'FeedbackListPage' })
const route = useRoute(),
  router = useRouter(),
  search = ref(String(route.query.search || ''))
const status = computed(() => String(route.query.status || ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const { data, busy, error, refresh } = useResource(() =>
  api.request<FeedbackPage>(
    queryURL('/api/admin/v1/feedback', {
      search: route.query.search || '',
      status: status.value || undefined,
      page: page.value,
      limit: 10
    })
  )
)
let scrollTop = 0,
  active = true,
  activated = false,
  scrollGeneration = 0,
  lastQuery = route.fullPath
/** 刷新后只滚动仍属于同次激活、同条件的列表，迟到回调不能影响详情
 * @param top 当前查询完成后需要恢复的列表位置
 */
const refreshAt = async (top: number) => {
  const run = ++scrollGeneration,
    query = route.fullPath
  await refresh()
  await nextTick()
  if (active && route.path === '/feedback' && route.fullPath === query && run === scrollGeneration)
    window.scrollTo({ top })
}
/** 应用筛选时重置分页，重复查询也实际刷新
 * @param values 本次明确改变的搜索、状态或页码
 */
const filter = async (values: Record<string, string | number>) => {
  const before = route.fullPath
  await router.replace({ query: { ...route.query, ...values, page: values.page || 1 } })
  if (route.fullPath === before) {
    scrollTop = 0
    await refreshAt(0)
  }
}
/** 记录进入详情前的列表滚动位置 */
const rememberScroll = () => {
  scrollTop = window.scrollY
  scrollGeneration++
}
/** 返回后刷新真实未读状态并恢复原列表位置 */
const activate = async () => {
  active = true
  if (!activated) {
    activated = true
    return
  }
  if (lastQuery !== route.fullPath) scrollTop = 0
  lastQuery = route.fullPath
  search.value = String(route.query.search || '')
  await refreshAt(scrollTop)
}
watch(
  () => route.fullPath,
  () => {
    if (active && route.path === '/feedback' && lastQuery !== route.fullPath) {
      search.value = String(route.query.search || '')
      scrollTop = 0
      lastQuery = route.fullPath
      void refreshAt(0)
    }
  }
)
onMounted(() => {
  void refresh()
})
onActivated(activate)
onBeforeRouteLeave(rememberScroll)
onDeactivated(() => {
  scrollGeneration++
  active = false
})
onBeforeUnmount(() => {
  scrollGeneration++
  active = false
})
</script>
<template>
  <div class="feedback-list-page management-page">
    <div class="page-heading">
      <h1>问题反馈</h1>
      <p>查看用户提交的问题，在同一条记录中持续沟通。</p>
    </div>
    <ElForm class="filters feedback-filters" @submit.prevent="filter({ search })">
      <ElInput
        v-model="search"
        type="search"
        aria-label="搜索反馈"
        placeholder="搜索反馈编号、用户或内容"
      />
      <ElButton native-type="submit" type="primary">查询</ElButton>
      <div class="segments" aria-label="处理状态">
        <ElButton :aria-pressed="!status" @click="filter({ status: '' })">全部</ElButton>
        <ElButton
          v-for="(label, value) in FEEDBACK_STATUS_LABELS"
          :key="value"
          :aria-pressed="status === value"
          @click="filter({ status: value })"
          >{{ label }}</ElButton
        >
      </div>
    </ElForm>
    <AppState
      element-plus
      :busy="busy"
      :error="error"
      :empty="data?.total === 0 && !busy"
      empty-title="暂无反馈"
      empty-text="可调整搜索内容或处理状态查看其他记录"
      @retry="refresh"
    />
    <div v-if="data?.items.length" class="table-wrap">
      <ElTable :data="data.items" row-key="id" class="feedback-table" table-layout="fixed">
        <ElTableColumn label="反馈编号／用户" :min-width="15">
          <template #default="{ row: item }">
            <span>{{ item.id }}</span
            ><img
              v-if="item.unread"
              class="feedback-unread"
              src="@/assets/icons/feedback-unread.svg"
              alt="未读用户补充"
            />
            <p>{{ item.user_code }}</p>
          </template>
        </ElTableColumn>
        <ElTableColumn label="问题分类" :min-width="12">
          <template #default="{ row: item }">{{
            FEEDBACK_CATEGORY_LABELS[item.category as keyof typeof FEEDBACK_CATEGORY_LABELS]
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="问题摘要" :min-width="34">
          <template #default="{ row: item }">
            <p>{{ item.summary }}</p>
            <p class="small muted">
              {{ item.source_title || '账号资料 · 通用反馈'
              }}<template v-if="item.card_id && !item.source_available">
                ·
                {{
                  item.source_unavailable_reason === 'deleted' ? '来源已删除' : '来源暂不可用'
                }}</template
              >
            </p>
            <p v-if="item.source_title_en" class="small muted">{{ item.source_title_en }}</p>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" :min-width="11">
          <template #default="{ row: item }"
            ><ElTag
              class="badge"
              :class="{ draft: ['pending', 'needs_info'].includes(item.status) }"
              disable-transitions
              >{{ FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] }}</ElTag
            ></template
          >
        </ElTableColumn>
        <ElTableColumn label="最后更新" :min-width="17">
          <template #default="{ row: item }">{{ dateText(item.updated_at) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" :min-width="11">
          <template #default="{ row: item }">
            <RouterLink
              v-slot="{ href, navigate }"
              :to="{
                path: `/feedback/${encodeURIComponent(item.id)}`,
                query: { back: route.fullPath }
              }"
              custom
            >
              <ElLink :href="href" :underline="false" @click="navigate">查看并处理</ElLink>
            </RouterLink>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
    <div v-if="data && !error" class="pagination">
      <span class="muted">共 {{ data.total }} 条反馈</span>
      <ElPagination
        v-if="data.total > 10"
        :current-page="page"
        :page-size="10"
        :total="data.total"
        :disabled="busy"
        layout="prev, slot, next"
        prev-text="上一页"
        next-text="下一页"
        @current-change="filter({ page: $event })"
      >
        <span>第 {{ page }} 页</span>
      </ElPagination>
    </div>
  </div>
</template>
<style scoped lang="scss">
.feedback-filters {
  margin-bottom: 20px;

  .el-input {
    max-width: 380px;
  }

  .segments {
    margin-left: auto;
  }
}

.feedback-list-page {
  .feedback-table {
    --el-table-row-hover-bg-color: #f6f9f1;
    --el-table-header-bg-color: #edf5e6;

    min-width: 850px;
    font-size: 13px;

    :deep(td[class~='el-table__cell']) {
      height: 93px;
    }

    :deep(.cell) {
      padding: 0 14px;
      line-height: 1.72;
      overflow-wrap: anywhere;
    }

    :deep(th .cell) {
      white-space: nowrap;
    }

    .el-link {
      font-size: 13px;
    }
  }

  .pagination {
    justify-content: flex-end;

    .el-pagination {
      gap: 12px;
    }
  }

  .feedback-unread {
    width: 8px;
    height: 8px;
    margin-left: 8px;
  }
}
</style>

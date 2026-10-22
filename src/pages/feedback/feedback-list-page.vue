<script setup lang="ts">
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
  <div class="feedback-list-page">
    <div class="page-heading">
      <h1>问题反馈</h1>
      <p>查看用户提交的问题，在同一条记录中持续沟通。</p>
    </div>
    <form class="filters feedback-filters" @submit.prevent="filter({ search })">
      <input
        v-model="search"
        type="search"
        aria-label="搜索反馈"
        placeholder="搜索反馈编号、用户或内容"
      />
      <button type="submit" class="primary">查询</button>
      <div class="segments" aria-label="处理状态">
        <button type="button" :aria-pressed="!status" @click="filter({ status: '' })">全部</button>
        <button
          v-for="(label, value) in FEEDBACK_STATUS_LABELS"
          :key="value"
          type="button"
          :aria-pressed="status === value"
          @click="filter({ status: value })"
        >
          {{ label }}
        </button>
      </div>
    </form>
    <AppState
      :busy="busy"
      :error="error"
      :empty="data?.total === 0 && !busy"
      empty-title="暂无反馈"
      empty-text="可调整搜索内容或处理状态查看其他记录"
      @retry="refresh"
    />
    <div v-if="data?.items.length" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>反馈编号／用户</th>
            <th>问题分类</th>
            <th>问题摘要</th>
            <th>状态</th>
            <th>最后更新</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id">
            <td>
              <span>{{ item.id }}</span
              ><img
                v-if="item.unread"
                class="feedback-unread"
                src="@/assets/icons/feedback-unread.svg"
                alt="未读用户补充"
              />
              <p>{{ item.user_id }}</p>
            </td>
            <td>{{ FEEDBACK_CATEGORY_LABELS[item.category] }}</td>
            <td>
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
            </td>
            <td>
              <span
                class="badge"
                :class="{ draft: ['pending', 'needs_info'].includes(item.status) }"
                >{{ FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] }}</span
              >
            </td>
            <td>{{ dateText(item.updated_at) }}</td>
            <td>
              <RouterLink
                :to="{
                  path: `/feedback/${encodeURIComponent(item.id)}`,
                  query: { back: route.fullPath }
                }"
                @click="rememberScroll"
                >查看并处理</RouterLink
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="data && !error" class="pagination">
      <span class="muted">共 {{ data.total }} 条反馈</span
      ><template v-if="data.total > 10"
        ><button :disabled="page <= 1 || busy" @click="filter({ page: page - 1 })">上一页</button
        ><span>第 {{ page }} 页</span
        ><button :disabled="page * 10 >= data.total || busy" @click="filter({ page: page + 1 })">
          下一页
        </button></template
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.feedback-filters {
  margin-bottom: 20px;

  input {
    max-width: 380px;
  }

  .segments {
    margin-left: auto;
  }
}

.feedback-list-page {
  table {
    table-layout: fixed;
  }

  th:first-child {
    width: 15%;
  }

  th:nth-child(2) {
    width: 12%;
  }

  th:nth-child(3) {
    width: 34%;
  }

  th:nth-child(4) {
    width: 11%;
  }

  th:nth-child(5) {
    width: 17%;
  }

  th:last-child {
    width: 11%;
  }

  td {
    height: 93px;
    overflow-wrap: anywhere;
  }

  .pagination {
    justify-content: flex-end;
  }

  .feedback-unread {
    width: 8px;
    height: 8px;
    margin-left: 8px;
  }
}
</style>

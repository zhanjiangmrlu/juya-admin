<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const router = useRouter()
const {
  data,
  busy,
  error,
  refresh: refreshResource
} = useResource(() => api.request<components['schemas']['Overview']>('/api/admin/v1/statistics'))
const metrics = computed(
  () =>
    [
      {
        key: 'user_count',
        label: '用户总数',
        unit: '人',
        id: 'users',
        path: '/users',
        query: { registered: 'all', checkin: 'all', from: 'statistics' }
      },
      {
        key: 'new_users_today',
        label: '今日新增用户',
        unit: '人',
        id: 'new-users',
        path: '/users',
        query: { registered: 'today', checkin: 'all', from: 'statistics' }
      },
      {
        key: 'published_card_count',
        label: '已发布场景卡片',
        unit: '张',
        id: 'cards',
        path: '/cards',
        query: { status: 'published', from: 'statistics' }
      },
      ...(data.value?.published_article_count !== undefined
        ? [
            {
              key: 'published_article_count',
              label: '已发布听读文章',
              unit: '篇',
              id: 'articles',
              path: '/listening',
              query: { status: 'published', from: 'statistics' }
            } as const
          ]
        : [])
    ] as const
)
let active = true,
  foregroundPending = false
/** 合并请求期间的前台事件，结算成功或失败后再读取一次服务器日期 */
const refresh = async () => {
  do {
    foregroundPending = false
    await refreshResource()
  } while (active && foregroundPending)
}
/** 回到前台时使用服务器日期重新统计 */
const foreground = () => {
  if (document.visibilityState !== 'visible') return
  if (busy.value) foregroundPending = true
  else void refresh()
}
onMounted(() => {
  void refresh()
  document.addEventListener('visibilitychange', foreground)
  window.addEventListener('focus', foreground)
})
onBeforeUnmount(() => {
  active = false
  foregroundPending = false
  document.removeEventListener('visibilitychange', foreground)
  window.removeEventListener('focus', foreground)
})
</script>
<template>
  <div>
    <div class="page-heading between">
      <div>
        <h1>数据统计</h1>
        <p>查看用户、场景与听读内容的总体情况。</p>
      </div>
      <button type="button" :disabled="busy" @click="refresh">
        <AppIcon name="refresh" />刷新
      </button>
    </div>
    <div class="overview-period">
      <span>统计日期（北京时间）：{{ data?.statistical_date || '暂未获取' }}</span
      ><span
        >{{ error && data ? '暂未更新 · ' : '' }}更新时间：{{
          data?.updated_at ? dateText(data.updated_at) : '暂未获取'
        }}</span
      >
    </div>
    <AppState :error="error" @retry="refresh" />
    <div class="overview-grid">
      <button
        v-for="metric in metrics"
        :key="metric.id"
        type="button"
        class="overview-metric"
        :disabled="!data"
        :data-metric="metric.id"
        @click="router.push({ path: metric.path, query: metric.query })"
      >
        <span class="metric-title">{{ metric.label }}</span
        ><span v-if="data" class="metric-number"
          ><strong class="metric-value">{{ data[metric.key] }}</strong
          ><small>{{ metric.unit }}</small></span
        ><span
          v-else-if="busy"
          class="metric-skeleton"
          role="status"
          aria-label="正在加载统计"
        /><span v-else class="unavailable">暂未获取</span
        ><span class="metric-link"
          >{{
            metric.id === 'cards'
              ? '查看已发布卡片'
              : metric.id === 'articles'
                ? '查看已发布文章'
                : metric.id === 'new-users'
                  ? '查看今日注册用户'
                  : '查看全部用户'
          }}<AppIcon name="arrow" :size="16"
        /></span>
      </button>
    </div>
    <section class="overview-notes">
      <h2>统计口径</h2>
      <p>用户总数：成功注册的稳定账号去重，包含未填写联系方式和尚未学习的用户，不包含管理员。</p>
      <p>今日新增：按北京时间今天首次注册的账号统计，不以登录或补充资料计数。</p>
      <p>已发布场景卡片：当前已发布且未删除的卡片，同卡多次发布只计一张；草稿、下线卡不计入。</p>
      <p>已发布听读文章：当前有效发布的不同文章，草稿、下线与删除不计入；用户历史已学篇数保留。</p>
      <p v-if="data && data.published_article_count === undefined">
        听读统计暂未获取，请刷新后核对。
      </p>
      <p>列表查询与统计的更新时间可能不同，发生新增或发布后可以刷新核对。</p>
    </section>
  </div>
</template>
<style scoped lang="scss">
.overview-period {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 12px;
  margin: 8px 0 24px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 24px;
}

.overview-metric {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  padding: 28px;
  min-height: 252px;
  border-radius: 12px;

  &:disabled {
    opacity: 1;
  }

  .metric-title {
    font-size: 15px;
    color: var(--muted);
  }

  .metric-number {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 28px 0 36px;
  }

  .metric-value {
    font-size: 48px;
    line-height: 1.15;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .metric-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--line);
    padding-top: 18px;
    color: var(--green);
    font-size: 12px;
  }

  .metric-skeleton,
  .unavailable {
    display: block;
    width: 100px;
    height: 50px;
    margin: 20px 0 24px;
    border-radius: 8px;
  }

  .metric-skeleton {
    background: #e8eee2;
    animation: pulse 1.3s ease-in-out infinite alternate;
  }

  .unavailable {
    font-size: 16px;
    color: var(--muted);
    padding-top: 12px;
  }
}

.overview-notes {
  border-top: 1px solid var(--line);
  margin-top: 34px;
  padding-top: 24px;

  h2 {
    font-size: 15px;
    margin-bottom: 12px;
  }

  p {
    color: var(--muted);
    font-size: 12px;
    margin: 7px 0;
    line-height: 1.9;
  }
}

@keyframes pulse {
  to {
    opacity: 0.45;
  }
}
</style>

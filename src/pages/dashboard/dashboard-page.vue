<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import ViewportFill from '@/components/viewport-fill/viewport-fill.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createDashboardAdapter } from '@/features/dashboard/dashboard-adapter'
import { useDashboard } from '@/features/dashboard/use-dashboard'
import { toWorkItemViewModel } from '@/features/work-items/work-item-model'
import { createApiClient } from '@/services/api/api-client'

const router = useRouter()
const authStore = useAuthStore()
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  onUnauthorized: () => {
    authStore.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const dashboard = useDashboard(createDashboardAdapter(client))
const metrics = computed(() => [
  {
    label: '今日新增用户',
    to: '/users?cohort=NEW_TODAY',
    value: dashboard.snapshot.value?.new_users_today ?? 0
  },
  {
    label: '完成3个开放场景未留微信号',
    to: '/users?cohort=OPEN_WITHOUT_CONTACT',
    value: dashboard.snapshot.value?.open_completed_without_contact ?? 0
  },
  {
    label: '待联系用户',
    to: '/users?contact_status=PENDING',
    value: dashboard.snapshot.value?.pending_contacts ?? 0
  },
  {
    label: '限时权益待开始',
    to: '/entitlements?type=LIMITED&status=PENDING',
    value: dashboard.snapshot.value?.limited_pending ?? 0
  },
  {
    label: '限时学习中',
    to: '/entitlements?type=LIMITED&status=ACTIVE',
    value: dashboard.snapshot.value?.limited_learning ?? 0
  },
  {
    label: '反馈紧急待办',
    to: '/feedback?sla=URGENT',
    value: dashboard.snapshot.value?.urgent_feedback ?? 0
  }
])

const primaryMetrics = computed(() =>
  metrics.value.filter((_metric, index) => [0, 2, 4, 5].includes(index))
)
const quickEntries = [
  { label: '用户管理', to: '/users' },
  { label: '统一权益中心', to: '/entitlements' },
  { label: '内容生产', to: '/content/scenes' },
  { label: '问题反馈', to: '/feedback' }
]

onMounted(dashboard.start)
onBeforeUnmount(dashboard.stop)

/**
 * 格式化待办截止时间用于辅助说明
 *
 * @param value - ISO 8601 截止时间
 * @returns 月日和分钟精度的本地时间
 */
function formatDueAt(value: string): string {
  return dayjs(value).format('MM-DD HH:mm')
}
</script>

<template>
  <ViewportFill class="dashboard-page">
    <ElAlert
      v-if="dashboard.error.value"
      class="error"
      :closable="false"
      :title="dashboard.error.value"
      type="error"
      show-icon
    >
      <template #default>
        <ElButton size="small" @click="dashboard.load">重新加载</ElButton>
      </template>
    </ElAlert>

    <ElSkeleton v-if="dashboard.isLoading.value" :rows="7" animated />

    <template v-else>
      <div class="metrics">
        <RouterLink v-for="(metric, index) in primaryMetrics" :key="metric.label" :to="metric.to">
          <AdminPanel
            class="metric"
            :class="{ 'metric-highlight': index === 0, 'metric-warning': index === 3 }"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </AdminPanel>
        </RouterLink>
      </div>

      <div class="content">
        <AdminPanel class="panel">
          <template #header>
            <div class="panel-heading">
              <h2>紧急待办</h2>
              <StatusTag
                :label="`${dashboard.groupedWorkItems.value.urgent.length} 项`"
                :tone="dashboard.groupedWorkItems.value.urgent.length ? 'danger' : 'success'"
              />
            </div>
            <p class="panel-description">按处理时限排序，未读新用户不计入待办</p>
          </template>

          <ElEmpty
            v-if="dashboard.groupedWorkItems.value.urgent.length === 0"
            description="当前没有紧急待办"
            :image-size="72"
          />
          <ul v-else class="item-list">
            <li
              v-for="item in dashboard.groupedWorkItems.value.urgent"
              :key="item.key"
              class="item"
            >
              <span class="indicator" :class="`tone-${toWorkItemViewModel(item).tone}`" />
              <div class="item-copy">
                <strong>{{ toWorkItemViewModel(item).title }}</strong>
                <span>
                  {{ toWorkItemViewModel(item).description }} · 截止 {{ formatDueAt(item.due_at) }}
                </span>
              </div>
              <RouterLink v-slot="{ navigate }" :to="toWorkItemViewModel(item).destination" custom>
                <ElButton
                  :type="toWorkItemViewModel(item).tone === 'danger' ? 'danger' : 'primary'"
                  plain
                  @click="navigate"
                >
                  {{ toWorkItemViewModel(item).actionLabel }}
                </ElButton>
              </RouterLink>
            </li>
          </ul>
          <RouterLink class="message-entry" to="/work-items"
            ><ElButton type="primary">打开消息中心</ElButton></RouterLink
          >
        </AdminPanel>

        <AdminPanel class="panel">
          <template #header>
            <div class="panel-heading">
              <h2>普通数据提醒</h2>
              <span v-if="dashboard.lastUpdatedAt.value" class="updated-at">
                更新于 {{ dayjs(dashboard.lastUpdatedAt.value).format('HH:mm:ss') }}
              </span>
            </div>
            <p class="panel-description">仅供查看，不计入紧急待办</p>
          </template>

          <ul class="summary-list">
            <li>
              <RouterLink to="/users?cohort=OPEN_WITHOUT_CONTACT"
                ><strong>完成开放场景但未填写微信号</strong
                ><span
                  >{{ dashboard.snapshot.value?.open_completed_without_contact ?? 0 }} 位用户</span
                ></RouterLink
              >
            </li>
            <li>
              <RouterLink to="/entitlements?type=LIMITED&status=PENDING"
                ><strong>限时权益待开始</strong
                ><span
                  >{{ dashboard.snapshot.value?.limited_pending ?? 0 }} 位用户</span
                ></RouterLink
              >
            </li>
          </ul>
          <p class="normal-metrics">
            <span>活跃用户 {{ dashboard.snapshot.value?.active_users ?? 0 }}</span>
            <RouterLink to="/entitlements?expiry=EXPIRING"
              >{{ dashboard.snapshot.value?.entitlement_warning_days ?? 30 }}天内正式权益到期
              {{ dashboard.snapshot.value?.expiring_entitlements ?? 0 }}</RouterLink
            >
            <RouterLink to="/content/jobs?status=errors"
              >异常批量任务 {{ dashboard.snapshot.value?.failed_jobs ?? 0 }}</RouterLink
            >
          </p>
          <ul v-if="dashboard.groupedWorkItems.value.informational.length > 0" class="item-list">
            <li
              v-for="item in dashboard.groupedWorkItems.value.informational"
              :key="item.key"
              class="item"
            >
              <div class="item-copy">
                <strong>{{ toWorkItemViewModel(item).title }}</strong>
                <span>截止 {{ formatDueAt(item.due_at) }}</span>
              </div>
              <RouterLink v-slot="{ navigate }" :to="toWorkItemViewModel(item).destination" custom>
                <ElButton plain type="primary" @click="navigate">查看</ElButton>
              </RouterLink>
            </li>
          </ul>
        </AdminPanel>
      </div>
      <aside class="permission-note">
        <strong>权限与内容提醒</strong>
        <p>未开通用户仅看到安全封面和简介；后台内容操作需经发布检查。</p>
      </aside>
      <section class="quick-section" aria-label="常用管理入口">
        <h2>常用管理入口</h2>
        <div class="quick-entries">
          <RouterLink v-for="entry in quickEntries" :key="entry.to" :to="entry.to"
            ><strong>{{ entry.label }}</strong
            ><span>查看 ›</span></RouterLink
          >
        </div>
      </section>
    </template>
  </ViewportFill>
</template>

<style scoped lang="scss">
.dashboard-page {
  .error {
    margin-bottom: 16px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 15px;
    margin-bottom: 22px;
    padding-right: 23px;
  }

  .metric {
    min-height: 126px;
  }

  .metric-highlight {
    background: #e8f0e1;
  }

  .metric-warning {
    background: #fff7f0;
  }

  .metric span,
  .metric strong {
    display: block;
  }

  .metric span {
    margin-bottom: 15px;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .metric strong {
    color: var(--juya-color-text-primary);
    font-size: 36px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  .metric-warning strong {
    color: var(--juya-color-danger);
  }

  .content {
    display: grid;
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 704fr) minmax(0, 438fr);
    gap: 18px;
  }

  .panel {
    display: flex;
    min-height: 342px;
    flex-direction: column;
  }
  /* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
  .panel :deep(.el-card__body) {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding-top: 0;
  }

  .panel :deep(.el-empty) {
    flex: 1;
    min-height: 0;
    padding-block: 20px;
  }
  /* stylelint-enable selector-class-pattern */
  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .panel-heading h2 {
    margin: 0;
    font-size: 20px;
  }

  .panel-description {
    margin: 8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .updated-at {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .item-list,
  .summary-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    min-height: 78px;
    align-items: center;
    gap: 13px;
    border-bottom: 1px solid var(--juya-color-border-light);
  }

  .item:last-child {
    border-bottom: 0;
  }

  .indicator {
    flex: 0 0 5px;
    width: 5px;
    height: 36px;
    border-radius: 3px;
    background: var(--juya-color-success);
  }

  .tone-danger {
    background: var(--juya-color-danger);
  }

  .tone-warning {
    background: var(--juya-color-warning);
  }

  .item-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 3px;
  }

  .item-copy strong {
    font-size: 13px;
  }

  .item-copy span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .message-entry {
    align-self: flex-end;
    margin-top: auto;
    padding-top: 12px;
  }

  .message-entry .el-button {
    min-width: 170px;
    height: 42px;
  }

  .summary-list li {
    padding: 17px 0 17px 18px;
    border-bottom: 1px solid var(--juya-color-border-light);
  }

  .summary-list a {
    position: relative;
    display: grid;
    gap: 3px;
  }

  .summary-list a::before {
    position: absolute;
    top: 3px;
    left: -18px;
    width: 5px;
    height: 36px;
    border-radius: 3px;
    background: var(--juya-color-success);
    content: '';
  }

  .summary-list strong {
    font-size: 13px;
  }

  .summary-list span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .normal-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    margin-top: 16px;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .permission-note {
    margin-top: 24px;
    padding: 13px 16px 15px;
    border-radius: 16px;
    background: var(--juya-color-primary-soft);
  }

  .permission-note strong {
    color: var(--juya-color-primary);
    font-size: 14px;
  }

  .permission-note p {
    margin: 20px 0 0;
    font-size: 13px;
  }

  .quick-section h2 {
    margin: 15px 0 8px;
    font-size: 17px;
  }

  .quick-entries {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .quick-entries a {
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--juya-color-border-light);
    border-radius: 14px;
    background: var(--juya-color-sidebar-surface);
  }

  .quick-entries strong {
    font-size: 15px;
  }

  .quick-entries span {
    color: var(--juya-color-brand-accent);
    font-size: 13px;
    white-space: nowrap;
  }
}

@media (width <= 1080px) {
  .dashboard-page {
    .content {
      grid-template-columns: 1fr;
    }

    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding-right: 0;
    }

    .quick-entries {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

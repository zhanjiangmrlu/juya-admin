<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

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
    label: '限时权益学习中',
    to: '/entitlements?type=LIMITED&status=ACTIVE',
    value: dashboard.snapshot.value?.limited_learning ?? 0
  },
  {
    label: '反馈紧急待办',
    to: '/feedback?sla=URGENT',
    value: dashboard.snapshot.value?.urgent_feedback ?? 0
  }
])

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
        <RouterLink v-for="metric in metrics" :key="metric.label" :to="metric.to">
          <ElCard class="metric" shadow="never">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </ElCard>
        </RouterLink>
      </div>

      <div class="content">
        <ElCard class="panel" shadow="never">
          <template #header>
            <div class="panel-heading">
              <h2>紧急待办</h2>
              <StatusTag
                :label="`${dashboard.groupedWorkItems.value.urgent.length} 项`"
                :tone="dashboard.groupedWorkItems.value.urgent.length ? 'danger' : 'success'"
              />
            </div>
          </template>

          <ElEmpty
            v-if="dashboard.groupedWorkItems.value.urgent.length === 0"
            description="当前没有紧急待办"
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
        </ElCard>

        <ElCard class="panel" shadow="never">
          <template #header>
            <div class="panel-heading">
              <h2>普通数据提醒</h2>
              <span v-if="dashboard.lastUpdatedAt.value" class="updated-at">
                更新于 {{ dayjs(dashboard.lastUpdatedAt.value).format('HH:mm:ss') }}
              </span>
            </div>
          </template>

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
          <ElEmpty
            v-if="dashboard.groupedWorkItems.value.informational.length === 0"
            description="暂无普通提醒"
          />
          <ul v-else class="item-list">
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
        </ElCard>
      </div>
    </template>
  </ViewportFill>
</template>

<style scoped lang="scss">
.dashboard-page {
  .error {
    margin-bottom: var(--juya-space-4);
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .metric {
    min-height: 88px;
  }

  .metric span,
  .metric strong {
    display: block;
  }

  .metric span {
    margin-bottom: 8px;
    color: var(--juya-color-text-regular);
    font-size: 12px;
  }

  .metric strong {
    color: var(--juya-color-sidebar);
    font-size: 26px;
    line-height: 1;
  }

  .normal-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .content {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    gap: 14px;
    min-height: 275px;
  }

  .panel {
    display: flex;
    min-height: 275px;
    flex-direction: column;
  }

  /* stylelint-disable-next-line selector-class-pattern -- Element Plus 外部组件类名 */
  .panel :deep(.el-card__body) {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .panel :deep(.el-empty) {
    width: 100%;
    flex: 1;
    justify-content: center;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-heading h2 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .updated-at {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .item-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    min-height: 68px;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--juya-color-border-light);
  }

  .item:last-child {
    border-bottom: 0;
  }

  .indicator {
    width: 6px;
    height: 30px;
    border-radius: 999px;
    background: var(--juya-color-info);
  }

  .indicator {
    &.tone-danger {
      background: var(--juya-color-danger);
    }

    &.tone-warning {
      background: var(--juya-color-warning);
    }
  }

  .item-copy {
    display: grid;
    flex: 1;
    gap: 3px;
  }

  .item-copy strong {
    color: var(--juya-color-text-primary);
    font-size: 13px;
  }

  .item-copy span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}

@media (width <= 1080px) {
  .dashboard-page {
    .content {
      flex: 0 0 auto;
      grid-template-columns: 1fr;
    }
  }
}
</style>

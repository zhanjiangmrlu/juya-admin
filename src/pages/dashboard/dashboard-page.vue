<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { createDashboardAdapter } from '@/features/dashboard/dashboard-adapter'
import { useDashboard } from '@/features/dashboard/use-dashboard'
import { toWorkItemViewModel } from '@/features/work-items/work-item-model'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const dashboard = useDashboard(createDashboardAdapter(useAdminApiClient()))
const metrics = computed(() => [
  {
    label: '今日新增用户',
    to: '/users?cohort=NEW_TODAY',
    value: dashboard.snapshot.value?.new_users_today
  },
  {
    label: '开放场景完成 · 未填微信',
    to: '/users?cohort=OPEN_WITHOUT_CONTACT',
    value: dashboard.snapshot.value?.open_completed_without_contact
  },
  {
    label: '待联系用户',
    to: '/users?contact_status=PENDING',
    value: dashboard.snapshot.value?.pending_contacts
  },
  {
    label: '限时权益待开始',
    to: '/entitlements?type=LIMITED&status=PENDING',
    value: dashboard.snapshot.value?.limited_pending
  },
  {
    label: '限时权益学习中',
    to: '/entitlements?type=LIMITED&status=ACTIVE',
    value: dashboard.snapshot.value?.limited_learning
  },
  {
    label: '反馈紧急待办',
    to: '/feedback?sla=URGENT',
    value: dashboard.snapshot.value?.urgent_feedback
  }
])
onMounted(dashboard.start)
onBeforeUnmount(dashboard.stop)
</script>

<template>
  <section class="dashboard-page">
    <ElAlert
      v-if="dashboard.error.value"
      :closable="false"
      :title="dashboard.error.value"
      type="error"
      show-icon
    >
      <template #default><ElButton @click="dashboard.load">重新加载</ElButton></template>
    </ElAlert>
    <ElSkeleton v-if="dashboard.isLoading.value" :rows="7" animated />
    <template v-else>
      <div class="metrics">
        <RouterLink v-for="metric in metrics" :key="metric.label" :to="metric.to" class="metric">
          <strong>{{ metric.value ?? '—' }}</strong
          ><span>{{ metric.label }}</span>
        </RouterLink>
      </div>
      <div class="content">
        <AdminPanel class="panel" title="紧急待办">
          <ElEmpty
            v-if="!dashboard.groupedWorkItems.value.urgent.length"
            description="当前没有紧急待办"
            :image-size="64"
          />
          <ElTable v-else :data="dashboard.groupedWorkItems.value.urgent" class="urgent-table">
            <ElTableColumn label="待办" min-width="190"
              ><template #default="{ row }">{{
                toWorkItemViewModel(row).title
              }}</template></ElTableColumn
            >
            <ElTableColumn label="时限" min-width="125"
              ><template #default="{ row }">{{
                dayjs(row.due_at).format('MM-DD HH:mm')
              }}</template></ElTableColumn
            >
            <ElTableColumn label="操作" width="105"
              ><template #default="{ row }">
                <RouterLink v-slot="{ navigate }" :to="toWorkItemViewModel(row).destination" custom
                  ><ElButton link type="primary" @click="navigate">{{
                    toWorkItemViewModel(row).actionLabel
                  }}</ElButton></RouterLink
                >
              </template></ElTableColumn
            >
          </ElTable>
        </AdminPanel>
        <AdminPanel class="panel reminders" title="普通提醒">
          <RouterLink to="/users?cohort=OPEN_WITHOUT_CONTACT"
            ><strong>完成3个开放场景但未填写微信号</strong
            ><span
              >{{ dashboard.snapshot.value?.open_completed_without_contact ?? '—' }}位用户 ·
              查看联系资料</span
            ></RouterLink
          >
          <RouterLink to="/entitlements?type=LIMITED&status=ACTIVE"
            ><strong>学习中权益不足24小时结束</strong
            ><span
              >{{ dashboard.groupedWorkItems.value.informational.length }}位用户 · 信息提醒</span
            ></RouterLink
          >
        </AdminPanel>
      </div>
      <aside class="production-note">
        <strong>内容生产</strong>
        <p>导入中英文文档与整段音频，系统整理后完成校对，再确认发布。</p>
      </aside>
    </template>
    <AppPageActions>
      <RouterLink v-slot="{ navigate }" to="/work-items" custom
        ><ElButton class="message-action" @click="navigate">查看消息</ElButton></RouterLink
      >
      <RouterLink v-slot="{ navigate }" to="/content/import" custom
        ><ElButton class="import-action" type="primary" @click="navigate"
          >批量导入内容</ElButton
        ></RouterLink
      >
    </AppPageActions>
  </section>
</template>

<style scoped lang="scss">
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;

  .metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 16px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100px;
    padding: 12px 20px;
    border-radius: 18px;
    background: var(--juya-color-surface);

    strong {
      font-size: 26px;
      line-height: 39px;
      font-variant-numeric: tabular-nums;
    }

    span {
      color: var(--juya-color-text-secondary);
      font-size: 11px;
      line-height: 18px;
    }
  }

  .content {
    display: grid;
    grid-template-columns: minmax(0, 692fr) minmax(0, 446fr);
    gap: 16px;
    align-items: center;
  }

  .panel {
    border-radius: 14px;

    --juya-panel-title-size: 18px;
    --juya-panel-title-line-height: 29px;
  }

  .panel :deep([class~='el-card__header']) {
    padding: 24px 24px 16px;
    border-bottom: 0;
  }

  .panel :deep([class~='el-card__body']) {
    padding: 0 24px 24px;
  }

  .urgent-table {
    --el-table-header-bg-color: var(--juya-color-primary-soft);
    --el-table-tr-bg-color: var(--juya-color-surface);
    --el-table-border-color: var(--juya-color-border-light);

    font-size: 14px;
  }

  .urgent-table :deep(th) {
    color: var(--juya-color-primary);
  }

  .urgent-table :deep(td),
  .urgent-table :deep(th) {
    height: 46px;
  }

  .reminders a {
    display: grid;
    gap: 16px;
    font-size: 14px;
    line-height: 22px;
  }

  .reminders a + a {
    margin-top: 16px;
  }

  .reminders strong {
    font-weight: 500;
  }

  .reminders span {
    color: var(--juya-color-text-secondary);
  }

  .production-note {
    padding: 16px;
    border-radius: 16px;
    background: var(--juya-color-primary-soft);
    font-size: 14px;
    line-height: 22px;

    strong {
      color: var(--juya-color-primary);
      font-weight: 500;
    }

    p {
      margin: 8px 0 0;
    }
  }
}

.message-action {
  min-width: 160px;
}

.import-action {
  min-width: 200px;
}

@media (width <= 1200px) {
  .dashboard-page .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (width <= 900px) {
  .dashboard-page .content {
    grid-template-columns: 1fr;
  }
}

@media (width <= 600px) {
  .dashboard-page .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

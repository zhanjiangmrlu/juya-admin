<script setup lang="ts">
import dayjs from 'dayjs'
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { useWorkItems } from '@/features/work-items/use-work-items'
import { createWorkItemAdapter } from '@/features/work-items/work-item-adapter'
import { toWorkItemViewModel } from '@/features/work-items/work-item-model'
import { createApiClient } from '@/services/api/api-client'

const router = useRouter()
const authStore = useAuthStore()
const controller = useWorkItems(
  createWorkItemAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      onUnauthorized: () => {
        authStore.clearSensitiveState()
        void router.replace({ name: 'login' })
      }
    })
  )
)

onMounted(controller.load)
onBeforeUnmount(controller.dispose)
</script>

<template>
  <section class="work-item-page admin-operations-surface">
    <ElAlert
      v-if="controller.error.value"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <AdminPanel class="message-card">
      <template #header>
        <div class="panel-title">
          <div>
            <h3>待办消息</h3>
            <p class="panel-subtitle">按时限和业务状态自动排序，不支持手动删除未完成任务</p>
          </div>
          <ElButton :loading="controller.isLoading.value" @click="controller.load"
            >刷新待办</ElButton
          >
        </div>
      </template>
      <div class="group-heading">
        <strong>优先处理</strong
        ><StatusTag
          :label="`${controller.actionable.value.length} 项`"
          :tone="controller.actionable.value.length ? 'warning' : 'success'"
        />
      </div>
      <ElEmpty v-if="controller.actionable.value.length === 0" description="暂无优先待办" />
      <ul v-else class="list">
        <li
          v-for="item in controller.actionable.value"
          :key="item.key"
          class="item"
          :class="toWorkItemViewModel(item).tone"
        >
          <div>
            <strong>{{ toWorkItemViewModel(item).title }}</strong
            ><span
              >{{ toWorkItemViewModel(item).description }} ·
              {{ dayjs(item.due_at).format('YYYY-MM-DD HH:mm') }}</span
            >
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="toWorkItemViewModel(item).destination"
            ><ElButton
              :plain="toWorkItemViewModel(item).tone !== 'danger'"
              :type="toWorkItemViewModel(item).tone === 'danger' ? 'danger' : 'primary'"
              @click="navigate"
              >{{ toWorkItemViewModel(item).actionLabel }}</ElButton
            ></RouterLink
          >
        </li>
      </ul>
      <div class="group-heading">
        <strong>信息提醒</strong
        ><StatusTag :label="`${controller.informational.value.length} 项`" />
      </div>
      <ElEmpty v-if="controller.informational.value.length === 0" description="暂无信息提醒" />
      <ul v-else class="list">
        <li v-for="item in controller.informational.value" :key="item.key" class="item info">
          <div>
            <strong>{{ toWorkItemViewModel(item).title }}</strong
            ><span>{{ dayjs(item.due_at).format('YYYY-MM-DD HH:mm') }}</span>
          </div>
        </li>
      </ul>
    </AdminPanel>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.work-item-page {
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

  .message-card {
    min-height: 624px;
    background: #eaf2e3;
  }

  .panel-title,
  .group-heading,
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .group-heading {
    justify-content: flex-start;
    margin: 10px 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .list {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .item {
    min-height: 70px;
    padding-left: 18px;
    position: relative;
  }

  .item::before {
    position: absolute;
    left: 0;
    width: 5px;
    height: 36px;
    border-radius: 3px;
    background: #b37b32;
    content: '';
  }

  .danger::before {
    background: #b85240;
  }

  .info::before {
    background: #4f833d;
  }

  .item div {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .item strong {
    font-size: 13px;
  }

  .item span {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .item :deep(.el-button) {
    min-width: 145px;
  }

  @media (width <= 700px) {
    .panel-title {
      flex-wrap: wrap;
    }

    .item :deep(.el-button) {
      min-width: 90px;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

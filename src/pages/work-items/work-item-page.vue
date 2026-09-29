<script setup lang="ts">
import dayjs from 'dayjs'
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

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
  <section class="work-item-page">
    <div class="heading">
      <div>
        <span>A13</span>
        <h2>消息中心</h2>
      </div>
      <ElButton :loading="controller.isLoading.value" @click="controller.load">刷新待办</ElButton>
    </div>
    <ElAlert
      v-if="controller.error.value"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <div class="grid">
      <ElCard shadow="never">
        <template #header
          ><div class="panel-title">
            <h3>优先处理</h3>
            <StatusTag
              :label="`${controller.actionable.value.length} 项`"
              :tone="controller.actionable.value.length ? 'warning' : 'success'"
            /></div
        ></template>
        <ElEmpty v-if="controller.actionable.value.length === 0" description="暂无优先待办" />
        <ul v-else class="list">
          <li v-for="item in controller.actionable.value" :key="item.key" class="item">
            <div>
              <strong>{{ toWorkItemViewModel(item).title }}</strong
              ><span
                >{{ toWorkItemViewModel(item).description }} ·
                {{ dayjs(item.due_at).format('YYYY-MM-DD HH:mm') }}</span
              >
            </div>
            <RouterLink v-slot="{ navigate }" custom :to="toWorkItemViewModel(item).destination"
              ><ElButton plain type="primary" @click="navigate">{{
                toWorkItemViewModel(item).actionLabel
              }}</ElButton></RouterLink
            >
          </li>
        </ul>
      </ElCard>
      <ElCard shadow="never">
        <template #header
          ><div class="panel-title">
            <h3>信息提醒</h3>
            <StatusTag :label="`${controller.informational.value.length} 项`" /></div
        ></template>
        <ElEmpty v-if="controller.informational.value.length === 0" description="暂无信息提醒" />
        <ul v-else class="list">
          <li v-for="item in controller.informational.value" :key="item.key" class="item">
            <div>
              <strong>{{ toWorkItemViewModel(item).title }}</strong
              ><span>{{ dayjs(item.due_at).format('YYYY-MM-DD HH:mm') }}</span>
            </div>
          </li>
        </ul>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.work-item-page {
  .heading,
  .panel-title,
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .heading {
    margin-bottom: 14px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .heading h2,
  .panel-title h3 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
  }

  .heading h2 {
    font-size: 18px;
  }

  .panel-title h3 {
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    gap: 14px;
    margin-top: 14px;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    min-height: 72px;
    gap: 14px;
    border-bottom: 1px solid var(--juya-color-border-light);

    &:last-child {
      border-bottom: 0;
    }
  }

  .list div {
    display: grid;
    gap: 4px;
  }

  .list strong {
    color: var(--juya-color-text-primary);
    font-size: 13px;
  }

  .list span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}
</style>

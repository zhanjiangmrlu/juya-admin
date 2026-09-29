<script setup lang="ts">
import dayjs from 'dayjs'
import { ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'
import {
  type ContactCorrectionAction,
  createContactCapabilities
} from '@/features/contacts/contact-capabilities'
import { useContactCorrections } from '@/features/contacts/use-contact-corrections'
import { createApiClient } from '@/services/api/api-client'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const correctionId = computed(() => String(route.params.id))
const capabilities = createContactCapabilities(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    getCsrfToken: () => authStore.csrfToken,
    onUnauthorized: () => {
      authStore.clearSensitiveState()
      void router.replace({ name: 'login' })
    }
  })
)
const controller = useContactCorrections(capabilities)
const canDecide = computed(
  () =>
    controller.detail.value?.status === 'PENDING' && controller.commandState.value !== 'submitting'
)

onMounted(() => void controller.loadDetail(correctionId.value))
onBeforeUnmount(controller.dispose)

/**
 * 格式化管理端日期时间。
 * @param value - ISO 8601 时间或空值
 * @returns 管理端日期时间文案
 */
function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '暂无记录'
}

/**
 * 二次确认后提交批准或拒绝决定。
 * @param action - 批准或拒绝动作
 */
async function confirmDecision(action: ContactCorrectionAction): Promise<void> {
  const actionLabel = action === 'approve' ? '批准并重置一次修改机会' : '拒绝申请'
  try {
    await ElMessageBox.confirm(
      `确认${actionLabel}？服务端会重新核对申请状态。`,
      '确认联系更正处理',
      {
        cancelButtonText: '取消',
        confirmButtonText: action === 'approve' ? '确认批准' : '确认拒绝',
        type: action === 'approve' ? 'warning' : 'error'
      }
    )
    await controller.decide(correctionId.value, action)
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return
  }
}
</script>

<template>
  <section class="contact-correction-page">
    <div class="heading">
      <div>
        <span>A04</span>
        <h2>联系资料更正申请</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }">
        <ElButton @click="navigate">返回联系申请列表</ElButton>
      </RouterLink>
    </div>

    <ElAlert
      v-if="controller.error.value"
      class="notice"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <ElSkeleton v-if="controller.state.value === 'loading'" :rows="8" animated />

    <div v-else-if="controller.detail.value" class="grid">
      <ElCard shadow="never">
        <template #header><h3>申请信息</h3></template>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="申请编号">{{ controller.detail.value.id }}</ElDescriptionsItem>
          <ElDescriptionsItem label="用户编号">{{
            controller.detail.value.user_id
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="句芽编号">{{
            controller.detail.value.juya_number
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="当前微信号">
            <span class="contact-value">{{ controller.detail.value.wechat_id || '未填写' }}</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="更正原因">
            <span class="reason">{{ controller.detail.value.reason }}</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="申请状态">{{
            controller.detail.value.status
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="申请时间">{{
            formatDateTime(controller.detail.value.created_at)
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="处理时间">{{
            formatDateTime(controller.detail.value.processed_at)
          }}</ElDescriptionsItem>
        </ElDescriptions>
        <ElAlert
          class="explanation"
          :closable="false"
          title="批准仅重置一次用户自助修改机会，不会直接改写微信号。"
          type="info"
          show-icon
        />
      </ElCard>

      <ElCard class="audit" shadow="never">
        <template #header><h3>联系与审计</h3></template>
        <ElTimeline v-if="controller.detail.value.timeline.length" class="timeline">
          <ElTimelineItem
            v-for="item in controller.detail.value.timeline"
            :key="`${item.occurred_at}-${item.event_type}`"
            :timestamp="formatDateTime(item.occurred_at)"
            placement="top"
          >
            <strong>{{ item.event_type }}</strong>
            <span>{{ item.actor_type }} · {{ item.status }}</span>
          </ElTimelineItem>
        </ElTimeline>
        <ElEmpty v-else description="暂无处理时间线" />
        <div class="actions">
          <ElButton
            :disabled="!canDecide"
            :loading="controller.commandState.value === 'submitting'"
            @click="confirmDecision('reject')"
          >
            拒绝
          </ElButton>
          <ElButton
            :disabled="!canDecide"
            :loading="controller.commandState.value === 'submitting'"
            type="primary"
            @click="confirmDecision('approve')"
          >
            批准并重置修改机会
          </ElButton>
        </div>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.contact-correction-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .heading h2,
  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
  }

  .heading h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  h3 {
    font-size: 15px;
  }

  .notice {
    margin-bottom: 14px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
    gap: 14px;
  }

  .audit {
    min-width: 0;
    min-height: 390px;
  }

  .contact-value,
  .reason {
    font-family: inherit;
    overflow-wrap: anywhere;
  }

  .explanation {
    margin-top: 14px;
  }

  .timeline {
    min-height: 205px;
    padding-inline-start: 4px;
  }

  .timeline strong,
  .timeline span {
    display: block;
  }

  .timeline span {
    margin-top: 4px;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .actions .el-button {
    width: 100%;
  }
}

@media (width <= 1100px) {
  .contact-correction-page {
    .grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

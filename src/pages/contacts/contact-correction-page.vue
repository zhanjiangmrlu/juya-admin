<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import {
  type ContactCorrectionAction,
  createContactCapabilities
} from '@/features/contacts/contact-capabilities'
import { useContactCorrections } from '@/features/contacts/use-contact-corrections'
import { createApiClient } from '@/services/api/api-client'
import { formatDateTime as formatTimestamp } from '@/shared/utils/date-time'

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
  return formatTimestamp(value, '暂无记录')
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
  <section class="contact-correction-page admin-brand-headings">
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
      <AdminPanel
        :title="ADMIN_SECTION_TITLES.contactCorrection.applicationCard"
        class="application-card"
      >
        <p class="record-summary">
          <span>申请 {{ controller.detail.value.id }}</span
          ><span
            >{{ controller.detail.value.juya_number }} · {{ controller.detail.value.user_id }}</span
          >
        </p>
        <ElDescriptions :column="1" direction="vertical" class="application-fields">
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
      </AdminPanel>

      <AdminPanel class="audit">
        <template #header
          ><div class="card-heading">
            <h3>核对与处理</h3>
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }">
              <ElButton @click="navigate">返回联系申请列表</ElButton>
            </RouterLink>
          </div></template
        >
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
      </AdminPanel>
    </div>
    <aside class="management-note">
      <strong>管理提醒</strong>
      <p>批准仅重置用户自助修改机会；实际修改联系方式后，仍需核对最新资料。</p>
    </aside>
  </section>
</template>

<style scoped lang="scss">
.contact-correction-page {
  min-width: 0;
  padding-top: 5px;

  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .card-heading .el-button {
    font-size: 12px;
  }

  .record-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin: 0 0 18px;
    color: #657a68;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .heading p {
    margin: 0;
    color: #657a68;
    font-size: 13px;
  }

  h3 {
    margin: 0;
    color: #244633;
    font-size: 20px;
  }

  .notice {
    margin-bottom: 18px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
    align-items: stretch;
  }

  .grid :deep(.el-card) {
    min-width: 0;
    min-height: 570px;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
  }

  .grid :deep([class~='el-card__header']) {
    padding: 18px 20px 12px;
    border-bottom: 0;
  }

  .grid :deep([class~='el-card__body']) {
    padding: 12px 20px 20px;
  }

  .grid .application-card {
    background: #eaf2e3;
  }

  .application-fields :deep([class~='el-descriptions__body']) {
    background: transparent;
  }

  .application-fields :deep([class~='el-descriptions__label']) {
    display: block;
    padding: 0 0 6px;
    font-weight: 500;
    line-height: 22px;
    color: #657a68;
    font-size: 13px;
  }

  .application-fields :deep([class~='el-descriptions__content']) {
    display: block;
    min-height: 38px;
    margin-bottom: 12px;
    line-height: 20px;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
    color: #244633;
  }

  .contact-value,
  .reason {
    font-family: inherit;
    overflow-wrap: anywhere;
  }

  .explanation {
    margin-top: 14px;
  }

  .audit :deep([class~='el-card__body']) {
    display: flex;
    min-height: 480px;
    box-sizing: border-box;
    flex-direction: column;
  }

  .timeline {
    flex: 1;
    padding: 32px 0 0 4px;
  }

  .timeline :deep(.el-timeline-item) {
    padding-bottom: 32px;
  }

  .timeline strong,
  .timeline span {
    display: block;
  }

  .timeline span {
    margin-top: 8px;
    color: #657a68;
    font-size: 12px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: auto;
  }

  .actions .el-button {
    min-height: 44px;
    margin-left: 0;
  }

  .management-note {
    margin-top: 18px;
    padding: 16px;
    border-radius: 16px;
    background: #e5f0dc;
    color: #244633;
  }

  .management-note strong {
    color: #4e7f3b;
    font-size: 14px;
  }

  .management-note p {
    margin: 20px 0 6px;
    font-size: 13px;
    line-height: 1.7;
  }
}

@media (width <= 1000px) {
  .contact-correction-page {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
  }
}
</style>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuditTimeline from '@/components/audit-timeline/audit-timeline.vue'
import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFeedbackAdapter } from '@/features/feedback/feedback-adapter'
import { FEEDBACK_STATUS_LABELS } from '@/features/feedback/feedback-copy'
import { formatFeedbackSla, getFeedbackOperations } from '@/features/feedback/feedback-model'
import { useFeedbackDetail } from '@/features/feedback/use-feedback-detail'
import { createApiClient } from '@/services/api/api-client'

import type { FeedbackStatus } from '@/features/feedback/feedback-model'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const ticketId = computed(() => String(route.params.id))

/**
 * 清理失效认证状态并跳转登录页
 *
 * @returns 无返回值
 */
function handleUnauthorized(): void {
  authStore.clearSensitiveState()
  void router.replace({ name: 'login' })
}

const controller = useFeedbackDetail(
  createFeedbackAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      onUnauthorized: handleUnauthorized
    })
  ),
  ticketId
)
const operations = computed(() =>
  controller.ticket.value ? getFeedbackOperations(controller.ticket.value) : []
)
const sla = computed(() =>
  controller.ticket.value ? formatFeedbackSla(controller.ticket.value, new Date()) : null
)

onMounted(() => void controller.load())
onBeforeUnmount(controller.dispose)

/**
 * 格式化反馈日期时间
 *
 * @param value - ISO 8601 日期时间
 * @returns 管理端日期时间文案
 */
function formatDateTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

/**
 * 返回反馈状态标签色调
 *
 * @param status - 反馈状态
 * @returns 状态标签色调
 */
function getStatusTone(status: FeedbackStatus): 'danger' | 'info' | 'success' | 'warning' {
  if (status === 'RESOLVED') return 'success'
  if (status === 'CLOSED_INSUFFICIENT') return 'info'
  if (status === 'NEED_MORE' || status === 'USER_SUPPLIED') return 'warning'
  return status === 'PENDING' ? 'danger' : 'info'
}
</script>

<template>
  <section class="feedback-detail-page">
    <ElAlert
      v-if="controller.error.value"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <ElSkeleton v-else-if="controller.isLoading.value" :rows="9" animated />

    <template v-else-if="controller.ticket.value">
      <div class="page-heading">
        <div>
          <span class="page-number">A15</span>
          <h2>问题反馈详情 · {{ controller.ticket.value.id }}</h2>
        </div>
        <div class="heading-actions">
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'feedback' }">
            <ElButton @click="navigate">返回反馈列表</ElButton>
          </RouterLink>
          <RouterLink
            v-if="operations.length"
            v-slot="{ navigate }"
            custom
            :to="{ name: 'feedback-respond', params: { id: controller.ticket.value.id } }"
          >
            <ElButton type="primary" @click="navigate">处理反馈</ElButton>
          </RouterLink>
        </div>
      </div>

      <div class="detail-grid">
        <div class="primary-column">
          <ElCard shadow="never">
            <template #header>
              <div class="card-heading">
                <h3>用户反馈</h3>
                <StatusTag
                  :label="FEEDBACK_STATUS_LABELS[controller.ticket.value.status]"
                  :tone="getStatusTone(controller.ticket.value.status)"
                />
              </div>
            </template>
            <PlainTextContent :content="controller.ticket.value.description" />
          </ElCard>

          <ElCard shadow="never">
            <template #header><h3 class="panel-title">处理时间线</h3></template>
            <ElAlert
              :closable="false"
              title="完整时间线接口待接入，当前不推测管理员和用户操作记录"
              type="warning"
              show-icon
            />
            <AuditTimeline :items="[]" />
          </ElCard>
        </div>

        <div class="secondary-column">
          <ElCard shadow="never">
            <template #header><h3 class="panel-title">反馈信息</h3></template>
            <ElDescriptions :column="1" border>
              <ElDescriptionsItem label="用户编号">{{
                controller.ticket.value.userId
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="反馈分类">{{
                controller.ticket.value.category
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="提交时间">{{
                formatDateTime(controller.ticket.value.createdAt)
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="最近更新">{{
                formatDateTime(controller.ticket.value.updatedAt)
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="补充轮次"
                >{{ controller.ticket.value.supplementRounds }} / 2</ElDescriptionsItem
              >
              <ElDescriptionsItem label="处理时限">
                <ElTag
                  :type="
                    sla?.state === 'overdue'
                      ? 'danger'
                      : sla?.state === 'due-soon'
                        ? 'warning'
                        : undefined
                  "
                  effect="plain"
                >
                  {{ sla?.text }}
                </ElTag>
              </ElDescriptionsItem>
            </ElDescriptions>
          </ElCard>

          <ElCard shadow="never">
            <template #header><h3 class="panel-title">反馈截图</h3></template>
            <ElEmpty description="截图访问能力待接入" :image-size="72" />
            <p class="capability-note">未生成或展示任何虚构、过期的签名地址</p>
          </ElCard>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.feedback-detail-page {
  .page-heading,
  .card-heading,
  .heading-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .page-heading {
    align-items: flex-start;
    margin-bottom: 14px;

    .page-number {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }
  }

  .heading-actions {
    gap: 8px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(330px, 2fr);
    gap: 14px;
  }

  .primary-column,
  .secondary-column {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .panel-title,
  .card-heading h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .capability-note {
    margin: -8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    text-align: center;
  }

  @media (width <= 1050px) {
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

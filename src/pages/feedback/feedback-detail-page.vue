<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AuditTimeline from '@/components/audit-timeline/audit-timeline.vue'
import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFeedbackAdapter } from '@/features/feedback/feedback-adapter'
import { FEEDBACK_STATUS_LABELS } from '@/features/feedback/feedback-copy'
import FeedbackInternalNote from '@/features/feedback/feedback-internal-note.vue'
import { formatFeedbackSla } from '@/features/feedback/feedback-model'
import FeedbackResponsePanel from '@/features/feedback/feedback-response-panel.vue'
import { useFeedbackDetail } from '@/features/feedback/use-feedback-detail'
import { createApiClient } from '@/services/api/api-client'
import { formatAdminActor } from '@/shared/utils/admin-actor'
import { formatDateTime as formatTimestamp } from '@/shared/utils/date-time'

import type { FeedbackCategory, FeedbackTimelineEvent } from '@/features/feedback/feedback-adapter'
import type { FeedbackStatus } from '@/features/feedback/feedback-model'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const ticketId = computed(() => String(route.params.id))
const isLoadingScreenshot = ref(false)
const categoryLabels: Record<FeedbackCategory, string> = {
  CONTENT: '内容问题',
  DISPLAY: '显示问题',
  FUNCTION: '功能问题',
  PRONUNCIATION: '发音问题'
}

/** 清理失效会话并跳转登录页。 */
const handleUnauthorized = (): void => {
  authStore.clearSensitiveState()
  void router.replace({ name: 'login' })
}

const controller = useFeedbackDetail(
  createFeedbackAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      getCsrfToken: () => authStore.csrfToken,
      onUnauthorized: handleUnauthorized
    })
  ),
  ticketId
)
const sla = computed(() =>
  controller.ticket.value ? formatFeedbackSla(controller.ticket.value, new Date()) : null
)
const lastSuppliedAt = computed(
  () =>
    controller.ticket.value?.rounds.filter((round) => round.suppliedAt).at(-1)?.suppliedAt ?? null
)
const timeline = computed(() =>
  (controller.ticket.value?.timeline ?? []).map((event, index) => ({
    actor:
      event.actorType === 'ADMIN'
        ? formatAdminActor(event.actorId, event.actorName)
        : event.actorType === 'SYSTEM'
          ? '系统'
          : `用户 · ${event.actorId}`,
    at: formatDateTime(event.occurredAt),
    content: timelineContent(event),
    id: `${event.occurredAt}-${event.eventType}-${index}`
  }))
)

onMounted(() => void controller.load())
onBeforeUnmount(controller.dispose)

/**
 * 格式化管理端日期时间。
 * @param value - ISO 8601 日期时间
 * @returns 日期时间文案
 */
const formatDateTime = (value: string): string => {
  return formatTimestamp(value)
}

/**
 * 返回反馈事件的管理员可读文案。
 * @param event - 反馈时间线事件
 * @returns 事件文案
 */
const timelineLabel = (event: FeedbackTimelineEvent): string => {
  const labels: Record<string, string> = {
    CLOSED_INSUFFICIENT: '因信息不足关闭',
    CREATED: '提交反馈',
    INTERNAL_NOTE_ADDED: '添加内部备注',
    PROCESSING_STARTED: '开始处理',
    RESOLVED: '反馈已解决',
    NEED_MORE: '要求补充信息',
    REOPENED: '用户重开反馈',
    USER_SUPPLIED: '用户已补充信息'
  }
  return labels[event.eventType] ?? event.eventType
}

/**
 * 拼接事件标签与服务端记录的业务说明。
 * @param event - 反馈时间线事件
 * @returns 完整事件文案
 */
const timelineContent = (event: FeedbackTimelineEvent): string => {
  const payloadKeys = ['request_text', 'supplement_text', 'reason', 'template']
  const detail = payloadKeys
    .map((key) => event.payload[key])
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  return detail ? `${timelineLabel(event)}：${detail}` : timelineLabel(event)
}

/** 按需重新签发并展示截图临时地址。 */
const loadScreenshot = async (): Promise<void> => {
  isLoadingScreenshot.value = true
  try {
    await controller.loadScreenshot()
  } catch {
    // 控制器提供页面错误状态。
  } finally {
    isLoadingScreenshot.value = false
  }
}

/**
 * 返回反馈状态标签色调。
 * @param status - 当前反馈状态
 * @returns 状态标签色调
 */
const getStatusTone = (status: FeedbackStatus): 'danger' | 'info' | 'success' | 'warning' => {
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
      :title="controller.error.value"
      type="error"
      :closable="false"
      ><ApiErrorDetails :error="controller.apiError.value"
    /></ElAlert>
    <ElSkeleton v-if="controller.isLoading.value" :rows="9" animated />
    <template v-else-if="controller.ticket.value"
      ><div class="detail-grid">
        <AdminPanel class="source-card"
          ><template #header
            ><h3>{{ categoryLabels[controller.ticket.value.category] }}</h3>
            <div class="status-line">
              <StatusTag
                :label="FEEDBACK_STATUS_LABELS[controller.ticket.value.status]"
                :tone="getStatusTone(controller.ticket.value.status)"
              /><ElTag
                :type="
                  sla?.state === 'overdue'
                    ? 'danger'
                    : sla?.state === 'due-soon'
                      ? 'warning'
                      : 'info'
                "
                effect="plain"
                >{{ sla?.text }}</ElTag
              >
            </div></template
          >
          <p class="identity">用户：{{ controller.ticket.value.userId }}</p>
          <p class="source-note">
            自动来源：{{ controller.ticket.value.source.page || '未记录页面'
            }}<span
              v-if="
                controller.ticket.value.source.scene_id || controller.ticket.value.source.sceneId
              "
            >
              /
              {{
                controller.ticket.value.source.scene_id || controller.ticket.value.source.sceneId
              }}</span
            >
          </p>
          <PlainTextContent :content="controller.ticket.value.description" />
          <AuditTimeline v-if="timeline.length" :items="timeline" class="timeline" />
          <div class="screenshot-actions">
            <span>截图：{{ controller.ticket.value.screenshots.length ? '已提供' : '未提供' }}</span
            ><ElButton
              v-if="controller.ticket.value.screenshots.length"
              :aria-label="controller.screenshotUrl.value ? '刷新临时地址' : '查看反馈截图'"
              link
              type="primary"
              :loading="isLoadingScreenshot"
              @click="loadScreenshot"
              >{{ controller.screenshotUrl.value ? '刷新临时地址' : '查看反馈截图' }}</ElButton
            >
          </div>
          <div v-if="controller.screenshotUrl.value" class="screenshot-preview">
            <img :src="controller.screenshotUrl.value" alt="反馈截图" /><small
              >临时地址有效至
              {{ formatDateTime(controller.screenshotExpiresAt.value || '') }}</small
            >
          </div>
          <p class="source-note">
            补充轮次{{ controller.ticket.value.supplementRounds }} / 2 · 状态与时限只读
          </p>
          <FeedbackInternalNote :key="ticketId" :ticket-id="ticketId" @updated="controller.load" />
        </AdminPanel>
        <FeedbackResponsePanel
          :key="ticketId"
          :ticket="controller.ticket.value"
          @updated="controller.load"
        />
      </div>
      <ElCollapse class="history"
        ><ElCollapseItem title="查看补充、回复与管理员记录"
          ><div class="history-grid">
            <div>
              <h3>补充记录</h3>
              <div
                v-for="round in controller.ticket.value.rounds"
                :key="round.roundNumber"
                class="record-block"
              >
                <strong>第{{ round.roundNumber }}轮</strong
                ><small
                  >要求补充：{{ round.pausedAt ? formatDateTime(round.pausedAt) : '—' }} ·
                  用户补充：{{
                    round.suppliedAt ? formatDateTime(round.suppliedAt) : '未补充'
                  }}</small
                ><PlainTextContent
                  :content="round.requestText || '未记录补充要求'"
                /><PlainTextContent :content="round.supplementText || '等待用户补充'" />
              </div>
            </div>
            <div>
              <h3>回复记录</h3>
              <div
                v-for="reply in controller.ticket.value.replies"
                :key="`${reply.sentAt}-${reply.adminId}`"
                class="record-block"
              >
                <strong>{{ reply.template }}</strong
                ><PlainTextContent :content="reply.note || '未填写补充说明'" /><small
                  >{{ reply.adminId }} · {{ formatDateTime(reply.sentAt) }}</small
                >
              </div>
              <h3>内部备注</h3>
              <div
                v-for="note in controller.ticket.value.internalNotes"
                :key="note.id"
                class="record-block"
              >
                <PlainTextContent :content="note.content" /><small
                  >{{ note.adminId }} · {{ formatDateTime(note.createdAt) }}</small
                >
              </div>
            </div>
          </div>
          <p>
            {{ ticketId }} · 提交于{{ formatDateTime(controller.ticket.value.createdAt) }} ·
            最近补充{{ lastSuppliedAt ? formatDateTime(lastSuppliedAt) : '未补充' }}
          </p></ElCollapseItem
        ></ElCollapse
      >
    </template>
  </section>
</template>
<style scoped lang="scss">
.feedback-detail-page {
  min-width: 0;

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 16px;
  }

  .source-card {
    margin-top: 20px;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 18px;
    line-height: 29px;
  }

  .status-line,
  .screenshot-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .identity {
    font-size: 14px;
  }

  .source-note {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    line-height: 18px;
  }

  .timeline {
    margin-top: 16px;
  }

  .screenshot-actions {
    color: var(--juya-color-primary);
    font-size: 12px;
  }

  .screenshot-preview img {
    display: block;
    width: 100%;
    max-height: 380px;
    object-fit: contain;
  }

  .history {
    margin-top: 20px;
  }

  .history-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .record-block {
    padding: 12px 0;

    small {
      display: block;
      color: var(--juya-color-text-secondary);
    }
  }

  @media (width <= 850px) {
    .detail-grid,
    .history-grid {
      grid-template-columns: 1fr;
    }

    .source-card {
      margin-top: 0;
    }
  }
}
</style>

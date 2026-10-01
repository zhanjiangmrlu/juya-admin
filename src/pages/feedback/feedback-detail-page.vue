<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AuditTimeline from '@/components/audit-timeline/audit-timeline.vue'
import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFeedbackAdapter } from '@/features/feedback/feedback-adapter'
import { FEEDBACK_STATUS_LABELS } from '@/features/feedback/feedback-copy'
import { formatFeedbackSla, getFeedbackOperations } from '@/features/feedback/feedback-model'
import { useFeedbackDetail } from '@/features/feedback/use-feedback-detail'
import { createApiClient } from '@/services/api/api-client'

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
function handleUnauthorized(): void {
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
const operations = computed(() =>
  controller.ticket.value ? getFeedbackOperations(controller.ticket.value) : []
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
    actor: `${event.actorType === 'ADMIN' ? '管理员' : '用户'} · ${event.actorId}`,
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
function formatDateTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

/**
 * 返回反馈事件的管理员可读文案。
 * @param event - 反馈时间线事件
 * @returns 事件文案
 */
function timelineLabel(event: FeedbackTimelineEvent): string {
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
function timelineContent(event: FeedbackTimelineEvent): string {
  const payloadKeys = ['request_text', 'supplement_text', 'reason', 'template']
  const detail = payloadKeys
    .map((key) => event.payload[key])
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  return detail ? `${timelineLabel(event)}：${detail}` : timelineLabel(event)
}

/** 按需重新签发并展示截图临时地址。 */
async function loadScreenshot(): Promise<void> {
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
    >
      <ApiErrorDetails :error="controller.apiError.value" />
    </ElAlert>
    <ElSkeleton v-if="controller.isLoading.value" :rows="9" animated />

    <template v-else-if="controller.ticket.value">
      <div class="page-heading">
        <div>
          <span class="page-number">A15</span>
          <h2>问题反馈详情 · {{ controller.ticket.value.id }}</h2>
        </div>
        <div class="heading-actions">
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'feedback', query: route.query }">
            <ElButton @click="navigate">返回反馈列表</ElButton>
          </RouterLink>
          <RouterLink
            v-if="operations.length"
            v-slot="{ navigate }"
            custom
            :to="{
              name: 'feedback-respond',
              params: { id: controller.ticket.value.id },
              query: route.query
            }"
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

          <ElCard v-if="controller.ticket.value.rounds.length" shadow="never">
            <template #header><h3 class="panel-title">补充记录</h3></template>
            <div
              v-for="round in controller.ticket.value.rounds"
              :key="round.roundNumber"
              class="record-block"
            >
              <strong>第 {{ round.roundNumber }} 轮</strong>
              <small
                >要求补充：{{ round.pausedAt ? formatDateTime(round.pausedAt) : '—' }} ·
                用户补充：{{
                  round.suppliedAt ? formatDateTime(round.suppliedAt) : '未补充'
                }}</small
              >
              <PlainTextContent :content="round.requestText ?? '未记录补充要求'" />
              <PlainTextContent :content="round.supplementText ?? '等待用户补充'" />
            </div>
          </ElCard>

          <ElCard v-if="controller.ticket.value.replies.length" shadow="never">
            <template #header><h3 class="panel-title">回复记录</h3></template>
            <div
              v-for="reply in controller.ticket.value.replies"
              :key="`${reply.sentAt}-${reply.adminId}`"
              class="record-block"
            >
              <strong>{{ reply.template }}</strong>
              <PlainTextContent :content="reply.note ?? '未填写补充说明'" />
              <small>{{ reply.adminId }} · {{ formatDateTime(reply.sentAt) }}</small>
            </div>
          </ElCard>

          <ElCard shadow="never">
            <template #header><h3 class="panel-title">处理时间线</h3></template>
            <AuditTimeline :items="timeline" />
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
                categoryLabels[controller.ticket.value.category]
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="提交时间">{{
                formatDateTime(controller.ticket.value.createdAt)
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="自动来源页面">{{
                controller.ticket.value.source.page || '未记录'
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="自动来源场景">{{
                controller.ticket.value.source.scene_id ||
                controller.ticket.value.source.sceneId ||
                '未关联'
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="最近补充时间">{{
                lastSuppliedAt ? formatDateTime(lastSuppliedAt) : '未补充'
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
                  >{{ sla?.text }}</ElTag
                >
              </ElDescriptionsItem>
            </ElDescriptions>
          </ElCard>

          <ElCard shadow="never">
            <template #header>
              <div class="card-heading">
                <h3>反馈截图</h3>
                <ElButton
                  v-if="controller.ticket.value.screenshots.length"
                  :aria-label="controller.screenshotUrl.value ? '刷新临时地址' : '查看反馈截图'"
                  :loading="isLoadingScreenshot"
                  size="small"
                  @click="loadScreenshot"
                >
                  {{ controller.screenshotUrl.value ? '刷新临时地址' : '查看反馈截图' }}
                </ElButton>
              </div>
            </template>
            <ElEmpty
              v-if="controller.ticket.value.screenshots.length === 0"
              description="该反馈没有截图"
              :image-size="72"
            />
            <div v-else-if="controller.screenshotUrl.value" class="screenshot-preview">
              <img :src="controller.screenshotUrl.value" alt="反馈截图" />
              <p>临时地址有效至 {{ formatDateTime(controller.screenshotExpiresAt.value ?? '') }}</p>
            </div>
            <p v-else class="capability-note">截图仅在点击后签发短期地址，离开页面即清除。</p>
          </ElCard>

          <ElCard v-if="controller.ticket.value.internalNotes.length" shadow="never">
            <template #header><h3 class="panel-title">内部备注</h3></template>
            <div
              v-for="note in controller.ticket.value.internalNotes"
              :key="note.id"
              class="record-block"
            >
              <PlainTextContent :content="note.content" />
              <small>{{ note.adminId }} · {{ formatDateTime(note.createdAt) }}</small>
            </div>
          </ElCard>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.feedback-detail-page {
  min-width: 0;

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
  }

  .page-number {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 18px;
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

  .record-block + .record-block {
    padding-top: 12px;
    margin-top: 12px;
    border-top: 1px solid var(--juya-color-border);
  }

  .record-block strong,
  .record-block small {
    display: block;
    margin-bottom: 6px;
    color: var(--juya-color-text-secondary);
  }

  .screenshot-preview img {
    display: block;
    width: 100%;
    max-height: 380px;
    object-fit: contain;
    border-radius: 8px;
    background: var(--juya-color-background);
  }

  .screenshot-preview p,
  .capability-note {
    margin: 10px 0 0;
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

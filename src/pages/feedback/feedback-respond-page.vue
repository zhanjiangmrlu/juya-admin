<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFeedbackAdapter } from '@/features/feedback/feedback-adapter'
import {
  FEEDBACK_OPERATION_LABELS,
  FEEDBACK_STATUS_LABELS
} from '@/features/feedback/feedback-copy'
import { getFeedbackOperations } from '@/features/feedback/feedback-model'
import { useFeedbackCommand } from '@/features/feedback/use-feedback-command'
import { useFeedbackNote } from '@/features/feedback/use-feedback-note'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'
import { formatDateTime } from '@/shared/utils/date-time'

import type { FeedbackTicket } from '@/features/feedback/feedback-adapter'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const ticketId = computed(() => String(route.params.id))
const ticket = shallowRef<FeedbackTicket | null>(null)
const isLoading = shallowRef(true)
const loadError = shallowRef<string | null>(null)
const loadApiError = shallowRef<ApiError | null>(null)
const form = reactive({
  closeReason: '',
  replyNote: '',
  requestText: '',
  template: ''
})

/**
 * 清理失效认证状态并跳转登录页
 *
 * @returns 无返回值
 */
function handleUnauthorized(): void {
  authStore.clearSensitiveState()
  void router.replace({ name: 'login' })
}

const adapter = createFeedbackAdapter(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    getCsrfToken: () => authStore.csrfToken,
    onUnauthorized: handleUnauthorized
  })
)
const command = useFeedbackCommand(adapter, ticket)
const note = useFeedbackNote(adapter, ticketId.value)
const operations = computed(() => (ticket.value ? getFeedbackOperations(ticket.value) : []))

onMounted(() => void loadTicket())
onBeforeUnmount(() => {
  ticket.value = null
})

/**
 * 加载当前反馈以确定可执行操作
 *
 * @returns 详情加载完成后的 Promise
 */
async function loadTicket(): Promise<void> {
  isLoading.value = true
  loadError.value = null
  loadApiError.value = null
  try {
    ticket.value = await adapter.getDetail(ticketId.value)
  } catch (failure) {
    loadApiError.value = failure instanceof ApiError ? failure : null
    loadError.value = failure instanceof Error ? failure.message : '反馈详情加载失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 执行开始处理命令
 *
 * @returns 命令完成后的 Promise
 */
async function handleStart(): Promise<void> {
  await submitCommand(command.start, '反馈已开始处理')
}

/**
 * 提交要求用户补充的信息
 *
 * @returns 命令完成后的 Promise
 */
async function handleSupplement(): Promise<void> {
  await submitCommand(() => command.requestSupplement(form.requestText), '补充要求已发送')
}

/**
 * 提交用户可见回复并解决反馈
 *
 * @returns 命令完成后的 Promise
 */
async function handleResolve(): Promise<void> {
  await submitCommand(
    () => command.resolve({ note: form.replyNote, template: form.template }),
    '反馈已回复并解决'
  )
}

/**
 * 以信息不足原因关闭反馈
 *
 * @returns 命令完成后的 Promise
 */
async function handleClose(): Promise<void> {
  await submitCommand(() => command.close(form.closeReason), '反馈已关闭')
}

/** 保存仅管理员可见的内部备注。 */
async function handleInternalNote(): Promise<void> {
  try {
    await note.submit()
    ElMessage.success('内部备注已保存')
  } catch {
    // 控制器保留草稿并提供错误文案。
  }
}

/**
 * 统一执行反馈命令并展示结果
 *
 * @param action - 当前需要执行的反馈命令
 * @param successMessage - 命令成功提示
 * @returns 命令执行完成后的 Promise
 */
async function submitCommand(action: () => Promise<void>, successMessage: string): Promise<void> {
  try {
    await action()
    ElMessage.success(successMessage)
  } catch {
    // 控制器负责提供可展示的错误文案
  }
}
</script>

<template>
  <section class="feedback-respond-page">
    <ElAlert v-if="loadError" :closable="false" :title="loadError" type="error" show-icon>
      <ApiErrorDetails :error="loadApiError" />
    </ElAlert>
    <ElSkeleton v-else-if="isLoading" :rows="9" animated />

    <template v-else-if="ticket">
      <div class="response-grid">
        <ElCard shadow="never" class="check-card">
          <template #header>
            <div class="card-heading">
              <h3>回复前检查</h3>
              <StatusTag :label="FEEDBACK_STATUS_LABELS[ticket.status]" /><RouterLink
                v-slot="{ navigate }"
                custom
                :to="{ name: 'feedback-detail', params: { id: ticket.id }, query: route.query }"
              >
                <ElButton @click="navigate">返回反馈详情</ElButton>
              </RouterLink>
            </div>
          </template>
          <PlainTextContent :content="ticket.description" />
          <ElDivider />
          <ElDescriptions :column="1">
            <ElDescriptionsItem label="用户编号">{{ ticket.userId }}</ElDescriptionsItem>
            <ElDescriptionsItem label="补充轮次"
              >{{ ticket.supplementRounds }} / 2</ElDescriptionsItem
            >
            <ElDescriptionsItem label="处理期限">{{
              formatDateTime(ticket.deadlineAt, '未设置')
            }}</ElDescriptionsItem>
          </ElDescriptions>
          <div class="check-item">
            <strong>重复发送</strong><span>提交前校验状态，重复请求使用原幂等键</span>
          </div>
          <aside class="notice">
            <strong>提交前确认</strong>
            <p>对用户回复与内部备注独立保存；反馈关闭后截图保留 30 天，7 天内用户可重开。</p>
          </aside>
        </ElCard>

        <ElCard shadow="never" class="result-card">
          <template #header
            ><h3 class="panel-title">发送处理结果</h3>
            <p class="panel-subtitle">{{ ticket.id }}</p></template
          >

          <ElAlert
            v-if="command.error.value"
            class="command-error"
            :closable="false"
            :title="command.error.value"
            type="error"
            show-icon
          >
            <ApiErrorDetails :error="command.apiError.value" />
            <p v-if="command.hasConflict.value">
              当前表单输入已保留，请返回详情核对最新状态后再决定是否重试
            </p>
          </ElAlert>

          <ElEmpty v-if="operations.length === 0" description="当前反馈已结束，无可执行操作" />

          <ElForm
            v-if="operations.includes('RESOLVE')"
            class="operation-panel stacked-panel"
            label-position="top"
            @submit.prevent="handleResolve"
          >
            <ElFormItem label="用户回复模板" required>
              <ElSelect v-model="form.template" placeholder="请选择回复模板">
                <ElOption label="问题已解决" value="RESOLVED" />
                <ElOption label="当前暂不可用" value="TEMPORARILY_UNAVAILABLE" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="用户可见补充说明">
              <ElInput
                v-model="form.replyNote"
                maxlength="200"
                placeholder="最多 200 字，将随模板回复给用户"
                show-word-limit
                type="textarea"
              />
            </ElFormItem>
            <ElButton
              :disabled="!form.template"
              :loading="command.isSubmitting.value"
              native-type="submit"
              type="primary"
            >
              回复并解决
            </ElButton>
          </ElForm>

          <ElDivider />
          <ElForm class="internal-note" label-position="top" @submit.prevent="handleInternalNote">
            <ElAlert
              v-if="note.error.value"
              class="note-error"
              :closable="false"
              :title="note.error.value"
              type="error"
              show-icon
            >
              <ApiErrorDetails :error="note.apiError.value" />
            </ElAlert>
            <ElFormItem label="内部备注（仅管理员可见）">
              <ElInput
                :model-value="note.draft.value"
                maxlength="200"
                placeholder="最多 200 字，仅管理员可见"
                show-word-limit
                type="textarea"
                @update:model-value="note.setDraft"
              />
            </ElFormItem>
            <ElButton
              :disabled="!note.draft.value.trim()"
              :loading="note.isSubmitting.value"
              native-type="submit"
              type="primary"
            >
              保存内部备注
            </ElButton>
          </ElForm>
        </ElCard>
      </div>
      <ElCard
        v-if="
          operations.some((operation) =>
            ['START', 'REQUEST_SUPPLEMENT', 'CLOSE'].includes(operation)
          )
        "
        shadow="never"
        class="additional-actions"
      >
        <template #header><h3>补充与其他处理</h3></template>
        <div class="additional-grid">
          <div v-if="operations.includes('START')" class="operation-panel">
            <div>
              <strong>{{ FEEDBACK_OPERATION_LABELS.START }}</strong
              ><span>接单并进入处理中状态</span>
            </div>
            <ElButton :loading="command.isSubmitting.value" type="primary" @click="handleStart">
              开始处理
            </ElButton>
          </div>
          <ElForm
            v-if="operations.includes('REQUEST_SUPPLEMENT')"
            class="operation-panel stacked-panel"
            label-position="top"
            @submit.prevent="handleSupplement"
          >
            <ElFormItem label="要求用户补充的信息" required>
              <ElInput
                v-model="form.requestText"
                maxlength="300"
                placeholder="说明需要补充的步骤、截图或环境信息"
                show-word-limit
                type="textarea"
              />
            </ElFormItem>
            <ElButton
              :disabled="!form.requestText.trim()"
              :loading="command.isSubmitting.value"
              native-type="submit"
              type="primary"
            >
              发送补充要求
            </ElButton>
          </ElForm>
          <ElForm
            v-if="operations.includes('CLOSE')"
            class="operation-panel stacked-panel"
            label-position="top"
            @submit.prevent="handleClose"
          >
            <ElFormItem label="信息不足关闭原因" required>
              <ElInput
                v-model="form.closeReason"
                maxlength="200"
                placeholder="说明无法继续处理的原因"
                show-word-limit
                type="textarea"
              />
            </ElFormItem>
            <ElButton
              :disabled="!form.closeReason.trim()"
              :loading="command.isSubmitting.value"
              native-type="submit"
              type="danger"
            >
              确认关闭
            </ElButton>
          </ElForm>
        </div>
      </ElCard>
    </template>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.feedback-respond-page {
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

  .notice {
    padding: 16px;
    border-radius: 16px;
    background: #e5f0dc;
    font-size: 13px;
    line-height: 1.8;
  }

  .notice strong {
    color: #4e7f3b;
    font-size: 14px;
  }

  .notice p {
    margin: 20px 0 0;
  }

  :deep(.el-card) {
    border-color: #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
    box-shadow: none;
  }

  :deep(.el-card__header) {
    padding: 16px 20px 12px;
    border-bottom: 0;
  }

  :deep(.el-card__body) {
    padding: 20px;
  }

  :deep(.el-button) {
    min-height: 38px;
    border-radius: 10px;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper),
  :deep(.el-textarea__inner) {
    border-radius: 10px;
    background: #fffdf7;
  }

  .additional-actions {
    margin-top: 18px;
  }

  .additional-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
  }

  .response-grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    align-items: start;
    gap: 18px;
  }

  .result-card {
    grid-column: 1;
    grid-row: 1;
    min-height: 630px;
    background: #eaf2e3;
  }

  .check-card {
    grid-column: 2;
    grid-row: 1;
    min-height: 455px;
  }

  .card-heading {
    flex-wrap: wrap;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .operation-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 0 20px;
    margin-bottom: 20px;
    border-bottom: 1px solid #d8e5d1;
  }

  .operation-panel strong,
  .operation-panel span,
  .check-item strong,
  .check-item span {
    display: block;
  }

  .operation-panel span,
  .check-item span {
    margin-top: 4px;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    line-height: 1.8;
  }

  .stacked-panel {
    display: block;
  }

  :deep(.el-form-item) {
    margin-bottom: 22px;
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-textarea__inner) {
    min-height: 60px;
  }

  :deep(.el-form-item__label) {
    margin-bottom: 8px;
    line-height: 22px;
  }

  .command-error,
  .note-error {
    margin-bottom: 16px;
  }

  .check-item {
    padding-left: 14px;
    margin: 28px 0;
    border-left: 5px solid #4f833d;
    font-size: 13px;
  }

  .check-card :deep(.el-descriptions) {
    margin-top: 24px;
  }

  .check-card :deep(.el-descriptions__cell) {
    padding-block: 12px;
    overflow-wrap: anywhere;
  }

  @media (width <= 900px) {
    .response-grid {
      grid-template-columns: 1fr;
    }

    .result-card,
    .check-card {
      grid-column: auto;
      grid-row: auto;
    }

    .result-card {
      order: -1;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

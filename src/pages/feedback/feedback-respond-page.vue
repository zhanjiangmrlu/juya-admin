<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
import { createApiClient } from '@/services/api/api-client'

import type { FeedbackTicket } from '@/features/feedback/feedback-adapter'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const ticketId = computed(() => String(route.params.id))
const ticket = shallowRef<FeedbackTicket | null>(null)
const isLoading = shallowRef(true)
const loadError = shallowRef<string | null>(null)
const form = reactive({
  closeReason: '',
  internalNote: '',
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
  try {
    ticket.value = await adapter.getDetail(ticketId.value)
  } catch (failure) {
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
    <ElAlert v-if="loadError" :closable="false" :title="loadError" type="error" show-icon />
    <ElSkeleton v-else-if="isLoading" :rows="9" animated />

    <template v-else-if="ticket">
      <div class="page-heading">
        <div>
          <span class="page-number">A16</span>
          <h2>反馈回复与关闭 · {{ ticket.id }}</h2>
        </div>
        <RouterLink
          v-slot="{ navigate }"
          custom
          :to="{ name: 'feedback-detail', params: { id: ticket.id } }"
        >
          <ElButton @click="navigate">返回反馈详情</ElButton>
        </RouterLink>
      </div>

      <div class="response-grid">
        <ElCard shadow="never">
          <template #header>
            <div class="card-heading">
              <h3>待处理反馈</h3>
              <StatusTag :label="FEEDBACK_STATUS_LABELS[ticket.status]" />
            </div>
          </template>
          <PlainTextContent :content="ticket.description" />
          <ElDivider />
          <ElDescriptions :column="2" border>
            <ElDescriptionsItem label="用户编号">{{ ticket.userId }}</ElDescriptionsItem>
            <ElDescriptionsItem label="补充轮次"
              >{{ ticket.supplementRounds }} / 2</ElDescriptionsItem
            >
          </ElDescriptions>
        </ElCard>

        <ElCard shadow="never">
          <template #header><h3 class="panel-title">可执行操作</h3></template>

          <ElAlert
            v-if="command.error.value"
            class="command-error"
            :closable="false"
            :title="command.error.value"
            type="error"
            show-icon
          >
            <template v-if="command.hasConflict.value" #default>
              当前表单输入已保留，请返回详情核对最新状态后再决定是否重试
            </template>
          </ElAlert>

          <ElEmpty v-if="operations.length === 0" description="当前反馈已结束，无可执行操作" />

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

          <ElDivider />
          <ElForm class="internal-note" label-position="top">
            <ElFormItem label="内部备注（仅管理员可见）">
              <ElInput
                v-model="form.internalNote"
                disabled
                placeholder="内部备注接口待接入，不会随用户回复提交"
                type="textarea"
              />
            </ElFormItem>
          </ElForm>
        </ElCard>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.feedback-respond-page {
  .page-heading,
  .card-heading,
  .operation-panel {
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
      font-size: 18px;
    }
  }

  .panel-title,
  .card-heading h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
  }

  .panel-title,
  .card-heading h3 {
    font-size: 15px;
  }

  .response-grid {
    display: grid;
    grid-template-columns: minmax(300px, 2fr) minmax(420px, 3fr);
    gap: 14px;
  }

  .operation-panel {
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--juya-color-border);
    border-radius: var(--juya-panel-radius);

    + .operation-panel {
      margin-top: 12px;
    }

    strong,
    span {
      display: block;
    }

    span {
      margin-top: 4px;
      color: var(--juya-color-text-secondary);
      font-size: 12px;
    }
  }

  .stacked-panel {
    display: block;

    .el-select {
      width: 100%;
    }
  }

  .command-error {
    margin-bottom: 12px;
  }

  .internal-note {
    opacity: 0.82;
  }

  @media (width <= 1100px) {
    .response-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import EntitlementPreviewDialog from '@/features/entitlements/entitlement-preview-dialog.vue'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { createFormalEntitlementAdapter } from '@/features/entitlements/formal-entitlement-adapter'
import {
  FORMAL_OPERATION_LABELS,
  FORMAL_TERM_LABELS,
  FORMAL_TERMS
} from '@/features/entitlements/formal-entitlement-model'
import { useFormalEntitlementCommand } from '@/features/entitlements/use-formal-entitlement-command'
import { createUserAdapter } from '@/features/users/user-adapter'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'
import { formatDateTime } from '@/shared/utils/date-time'

import type { FormalDetail } from '@/features/entitlements/entitlement-query-adapter'
import type {
  FormalEntitlementOperation,
  FormalEntitlementTerm
} from '@/features/entitlements/formal-entitlement-model'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const entitlementId = computed(() => String(route.params.id))
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getCsrfToken: () => auth.csrfToken,
  onUnauthorized: () => {
    auth.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const query = createEntitlementQueryAdapter(client)
const users = createUserAdapter(client)
const userIdentity = ref('')
const controller = shallowRef(useFormalEntitlementCommand(createFormalEntitlementAdapter(client)))
let requestSequence = 0
onBeforeUnmount(() => {
  requestSequence += 1
})
const detail = ref<FormalDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const apiError = shallowRef<ApiError | null>(null)
const commandApiError = shallowRef<ApiError | null>(null)
const commandError = ref<string | null>(null)
const hadConflict = ref(false)
const form = reactive({
  operation: 'RENEW' as FormalEntitlementOperation,
  term: 'month_3' as FormalEntitlementTerm
})
const confirmVisible = ref(false)
const confirmationReason = ref('')
const availableTerms = computed(() =>
  FORMAL_TERMS.filter((term) => form.operation !== 'EXTEND' || term !== 'permanent')
)
const statusLabels: Record<string, string> = {
  ACTIVE: '正常使用',
  PAUSED: '已暂停',
  REVOKED: '已撤销',
  EXPIRED: '已到期'
}
const allowedOperations = computed(() =>
  (detail.value?.availableOperations ?? []).filter((value): value is FormalEntitlementOperation =>
    Object.hasOwn(FORMAL_OPERATION_LABELS, value)
  )
)
const /**
   * 加载正式权益详情。
   * @param keepDraft - 是否保留目标操作与期限
   * @returns 加载完成的 Promise
   */
  load = async (keepDraft = false): Promise<void> => {
    const sequence = ++requestSequence
    const id = entitlementId.value
    detail.value = null
    userIdentity.value = ''
    confirmVisible.value = false
    controller.value = useFormalEntitlementCommand(createFormalEntitlementAdapter(client))
    if (!keepDraft) {
      commandError.value = null
      commandApiError.value = null
      hadConflict.value = false
    }
    state.value = 'loading'
    error.value = ''
    apiError.value = null
    try {
      const result = await query.formal(id)
      if (sequence !== requestSequence || id !== entitlementId.value) return
      if (result.id !== id) throw new Error('权益详情与当前对象不一致')
      detail.value = result
      if (!keepDraft) {
        form.operation =
          allowedOperations.value.find((operation) => operation === route.query.action) ??
          allowedOperations.value[0] ??
          'RENEW'
        form.term = FORMAL_TERMS.find((value) => value === detail.value?.term) ?? 'month_3'
      }
      state.value = 'ready'
      void users
        .getUserDetail(result.userId)
        .then((user) => {
          if (sequence === requestSequence)
            userIdentity.value = `${user.nickname || '未设置昵称'} · 句芽号：${user.juya_number || user.user_id}`
        })
        .catch(() => undefined)
    } catch (failure) {
      if (sequence !== requestSequence || id !== entitlementId.value) return
      apiError.value = failure instanceof ApiError ? failure : null
      state.value = 'error'
      error.value = '正式权益详情加载失败，请重试'
    }
  }
watch(
  [form, detail],
  () => {
    if (!detail.value) return
    controller.value.setDraft({
      operation: form.operation,
      packageId: detail.value.packageId,
      term: ['RENEW', 'GRANT', 'EXTEND'].includes(form.operation) ? form.term : null,
      reason: confirmationReason.value.trim(),
      userId: detail.value.userId
    })
  },
  { deep: true }
)
watch(
  [entitlementId, () => route.query.action],
  () => {
    void load()
  },
  { immediate: true }
)
const /**
   * 获取正式权益服务端预览。
   * @returns 服务端预览完成后的 Promise
   */
  preview = async (): Promise<void> => {
    if (
      state.value !== 'ready' ||
      detail.value?.id !== entitlementId.value ||
      !allowedOperations.value.includes(form.operation)
    )
      return
    const sequence = requestSequence
    commandError.value = null
    commandApiError.value = null
    hadConflict.value = false
    try {
      if (detail.value)
        controller.value.setDraft({
          operation: form.operation,
          packageId: detail.value.packageId,
          term: ['RENEW', 'GRANT', 'EXTEND'].includes(form.operation) ? form.term : null,
          reason: confirmationReason.value.trim(),
          userId: detail.value.userId
        })
      await controller.value.preview()
      if (sequence !== requestSequence) return
      confirmVisible.value = true
    } catch {
      /* 控制器显示错误 */
    }
  }
const /**
   * 确认正式权益命令。
   * @param reason - 审计原因
   * @returns 命令完成后的 Promise
   */
  confirm = async (reason: string): Promise<void> => {
    if (
      state.value !== 'ready' ||
      detail.value?.id !== entitlementId.value ||
      !allowedOperations.value.includes(form.operation)
    )
      return
    const sequence = requestSequence
    try {
      await controller.value.submit(reason)
      if (sequence !== requestSequence) return
      confirmVisible.value = false
      ElMessage.success('正式权益状态已更新')
      await load()
    } catch {
      if (sequence !== requestSequence) return
      hadConflict.value = controller.value.hasConflict.value
      commandError.value = controller.value.errorMessage.value
      commandApiError.value = controller.value.apiError.value
      if (hadConflict.value) {
        confirmVisible.value = false
        await load(true)
      }
    }
  }
</script>

<template>
  <section class="formal-action-page admin-brand-headings">
    <ElSkeleton v-if="state === 'loading'" :rows="6" animated aria-label="正在加载正式权益" />
    <ElAlert v-if="error" class="notice" :title="error" type="error" :closable="false" show-icon
      ><ApiErrorDetails :error="apiError" /><ElButton @click="load(true)">重试</ElButton></ElAlert
    >

    <AdminPanel
      v-if="detail"
      :title="
        form.operation === 'RENEW' ? '续期信息' : `${FORMAL_OPERATION_LABELS[form.operation]}信息`
      "
      class="operation-card"
    >
      <ElForm label-position="top" @submit.prevent="preview"
        ><ElFormItem label="用户 / 内容包"
          ><div class="readonly-field">
            {{ userIdentity || detail.userId }} · {{ detail.packageName }}
          </div></ElFormItem
        ><ElFormItem label="可执行操作"
          ><ElSelect v-model="form.operation" :disabled="!allowedOperations.length"
            ><ElOption
              v-for="operation in allowedOperations"
              :key="operation"
              :label="FORMAL_OPERATION_LABELS[operation]"
              :value="operation" /></ElSelect></ElFormItem
        ><ElFormItem
          v-if="['RENEW', 'GRANT', 'EXTEND'].includes(form.operation)"
          :label="form.operation === 'EXTEND' ? '延期期限 · 从原到期时间顺延' : '续期期限'"
          ><ElSelect v-model="form.term"
            ><ElOption
              v-for="term in availableTerms"
              :key="term"
              :label="FORMAL_TERM_LABELS[term]"
              :value="term" /></ElSelect></ElFormItem
        ><ElFormItem
          :label="
            ['PAUSE', 'RESUME', 'REVOKE', 'EXTEND'].includes(form.operation)
              ? '原因 · 必填，确认时核对'
              : '备注 · 选填'
          "
          ><ElInput
            v-model="confirmationReason"
            :aria-label="form.operation === 'EXTEND' ? '延期原因' : '操作备注'"
            placeholder="可补充说明"
            maxlength="200" /></ElFormItem
      ></ElForm>
      <ElAlert
        v-if="commandError || controller.errorMessage.value"
        :title="commandError ?? controller.errorMessage.value ?? ''"
        type="error"
        :closable="false"
        ><ApiErrorDetails :error="commandApiError ?? controller.apiError.value" />
        <p v-if="hadConflict">原操作输入已保留，当前权益发生变化，请刷新状态并重新预览。</p>
        <ElButton v-if="hadConflict" @click="load(true)">刷新服务端信息</ElButton></ElAlert
      >
      <ElCollapse
        ><ElCollapseItem title="查看当前权益详情"
          ><p>
            {{ statusLabels[detail.status] || detail.status }} ·
            {{ FORMAL_TERM_LABELS[detail.term as FormalEntitlementTerm] || detail.term }}
          </p>
          <p>
            生效：{{ formatDateTime(detail.grantedAt) }} · 到期：{{
              formatDateTime(detail.expiresAt, '无到期日期')
            }}
          </p>
          <p>{{ entitlementId }} · v{{ detail.version }}</p></ElCollapseItem
        ></ElCollapse
      >
    </AdminPanel>
    <AppPageActions
      ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
        ><ElButton @click="navigate">返回列表</ElButton></RouterLink
      ><ElButton
        type="primary"
        :disabled="
          state !== 'ready' ||
          !allowedOperations.includes(form.operation) ||
          (form.operation === 'EXTEND' && (!confirmationReason.trim() || form.term === 'permanent'))
        "
        :loading="controller.commandState.value === 'submitting'"
        @click="preview"
        >{{
          form.operation === 'RENEW'
            ? '获取续期预览'
            : `获取${FORMAL_OPERATION_LABELS[form.operation]}预览`
        }}</ElButton
      ></AppPageActions
    >
    <EntitlementPreviewDialog
      v-if="detail && controller.previewResult.value"
      v-model="confirmVisible"
      v-model:reason="confirmationReason"
      :before="controller.previewResult.value.before"
      :after="controller.previewResult.value"
      :actual-operation="controller.previewResult.value.actualOperation"
      :expected-version="controller.previewResult.value.expectedVersion"
      :user-label="`用户 ${detail.userId}`"
      :user-id="detail.userId"
      :content-label="detail.packageName"
      :reason-required="
        !['GRANT', 'RENEW', 'CONVERT_PERMANENT', 'REGRANT'].includes(
          controller.previewResult.value.actualOperation
        )
      "
      :error="controller.errorMessage.value"
      :object-id="entitlementId"
      :submitting="controller.commandState.value === 'submitting'"
      @confirm="confirm"
    />
  </section>
</template>
<style scoped lang="scss">
.formal-action-page {
  min-width: 0;

  .operation-card {
    background: var(--juya-color-surface);
  }

  :deep(.el-select) {
    width: 100%;
  }

  .readonly-field {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--juya-color-border);
    border-radius: 12px;
    overflow-wrap: anywhere;
  }

  .notice {
    margin-bottom: 20px;
  }
}
</style>

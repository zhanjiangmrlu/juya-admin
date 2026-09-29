<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { createLimitedEntitlementAdapter } from '@/features/entitlements/limited-entitlement-adapter'
import { LIMITED_OPERATION_LABELS } from '@/features/entitlements/limited-entitlement-model'
import { useLimitedEntitlementCommand } from '@/features/entitlements/use-limited-entitlement-command'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { LimitedDetail } from '@/features/entitlements/entitlement-query-adapter'
import type { LimitedEntitlementOperation } from '@/features/entitlements/limited-entitlement-model'

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
const controller = useLimitedEntitlementCommand(createLimitedEntitlementAdapter(client))
const detail = ref<LimitedDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const apiError = shallowRef<ApiError | null>(null)
const commandApiError = shallowRef<ApiError | null>(null)
const commandError = ref<string | null>(null)
const hadConflict = ref(false)
const operation = ref<LimitedEntitlementOperation>('PAUSE')
const confirmVisible = ref(false)
const allowedOperations = computed(() =>
  (detail.value?.availableOperations ?? []).filter(
    (value): value is LimitedEntitlementOperation => value in LIMITED_OPERATION_LABELS
  )
)
const nextStatus = computed(
  () =>
    ({
      EXTEND_START_DEADLINE: 'PENDING（截止延长）',
      RESTORE_START_WINDOW: 'PENDING（窗口恢复）',
      GRANT: 'PENDING',
      PAUSE: 'PAUSED',
      RESUME: 'ACTIVE',
      REVOKE: 'REVOKED'
    })[operation.value]
)
/**
 * 加载限时权益详情。
 * @param keepDraft - 是否保留目标操作
 * @returns 加载完成的 Promise
 */
async function load(keepDraft = false): Promise<void> {
  state.value = 'loading'
  error.value = ''
  apiError.value = null
  try {
    detail.value = await query.limited(entitlementId.value)
    if (!keepDraft) operation.value = allowedOperations.value[0] ?? 'PAUSE'
    state.value = 'ready'
  } catch (failure) {
    apiError.value = failure instanceof ApiError ? failure : null
    state.value = 'error'
    error.value = '限时权益详情加载失败，请重试'
  }
}
watch([operation, detail], () => {
  if (!detail.value) return
  controller.setDraft({
    campaignVersionId: null,
    entitlementId: detail.value.id,
    operation: operation.value,
    userId: null
  })
})
watch(
  entitlementId,
  () => {
    void load()
  },
  { immediate: true }
)
/**
 * 确认限时权益命令。
 * @param reason - 按接口要求填写的原因
 * @returns 命令完成后的 Promise
 */
async function confirm(reason: string): Promise<void> {
  try {
    commandError.value = null
    commandApiError.value = null
    hadConflict.value = false
    await controller.submit(reason)
    confirmVisible.value = false
    ElMessage.success('限时权益状态已更新')
    await load()
  } catch (failure) {
    confirmVisible.value = false
    hadConflict.value = failure instanceof ApiError && failure.status === 409
    commandError.value = controller.disabledReason.value ?? controller.errorMessage.value
    commandApiError.value = controller.apiError.value
    if (hadConflict.value) await load(true)
  }
}
</script>

<template>
  <section class="limited-action-page">
    <ElCard shadow="never"
      ><template #header
        ><div class="heading">
          <div>
            <span>A09</span>
            <h2>限时权益操作 · {{ entitlementId }}</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
            ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
          >
        </div></template
      >
      <ElSkeleton v-if="state === 'loading'" :rows="6" animated aria-label="正在加载限时权益" />
      <ElAlert v-if="error" class="notice" :title="error" type="error" :closable="false" show-icon
        ><ApiErrorDetails :error="apiError" /><ElButton size="small" @click="load(true)"
          >重试</ElButton
        ></ElAlert
      >
      <template v-if="detail"
        ><ElDescriptions :column="2" border
          ><ElDescriptionsItem label="用户编号">{{ detail.userId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="活动"
            >{{ detail.campaignName }} · {{ detail.campaignId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="当前状态">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="活动版本">{{ detail.campaignVersionId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="启动截止">{{ detail.startDeadline }}</ElDescriptionsItem
          ><ElDescriptionsItem label="到期时间">{{
            detail.expiresAt ?? '尚未开始'
          }}</ElDescriptionsItem
          ><ElDescriptionsItem label="补救次数">{{ detail.remedyCount }}</ElDescriptionsItem
          ><ElDescriptionsItem label="服务端版本"
            >v{{ detail.version }}</ElDescriptionsItem
          ></ElDescriptions
        >
        <ElFormItem class="operation" label="服务端允许的操作"
          ><ElSelect v-model="operation" :disabled="allowedOperations.length === 0"
            ><ElOption
              v-for="item in allowedOperations"
              :key="item"
              :label="LIMITED_OPERATION_LABELS[item]"
              :value="item" /></ElSelect
        ></ElFormItem>
        <ElAlert
          v-if="allowedOperations.length === 0"
          class="notice"
          title="当前状态没有可执行操作。请返回权益中心查看其他记录。"
          type="info"
          :closable="false"
        />
        <ElAlert
          v-if="commandError || controller.errorMessage.value"
          class="notice"
          :title="commandError ?? controller.errorMessage.value ?? ''"
          type="error"
          :closable="false"
          show-icon
          ><ApiErrorDetails :error="commandApiError ?? controller.apiError.value" />
          <p v-if="hadConflict">
            原操作选择已保留。服务端最新版本：{{
              state === 'ready' ? `v${detail.version}` : '暂未获取，请刷新'
            }}，请核对当前状态。
          </p>
          <ElButton size="small" @click="load(true)">刷新服务端信息</ElButton></ElAlert
        >
        <ElDescriptions v-if="controller.result.value" :column="2" border
          ><ElDescriptionsItem label="结果状态">{{
            controller.result.value.status
          }}</ElDescriptionsItem
          ><ElDescriptionsItem label="启动截止">{{
            controller.result.value.startDeadline
          }}</ElDescriptionsItem></ElDescriptions
        >
        <ElButton
          class="submit"
          type="primary"
          :disabled="
            !allowedOperations.includes(operation) || controller.commandState.value === 'submitting'
          "
          :loading="controller.commandState.value === 'submitting'"
          @click="confirmVisible = true"
          >二次确认并执行</ElButton
        >
      </template> </ElCard
    ><ConfirmDialog
      v-if="detail"
      v-model="confirmVisible"
      :before-status="detail.status"
      :after-status="nextStatus"
      :impact-scope="`${LIMITED_OPERATION_LABELS[operation]}限时权益；用户 ${detail.userId}`"
      :object-id="entitlementId"
      :reason-required="operation === 'PAUSE' || operation === 'REVOKE'"
      title="确认限时权益状态操作"
      :submitting="controller.commandState.value === 'submitting'"
      @confirm="confirm"
    />
  </section>
</template>

<style scoped lang="scss">
.limited-action-page {
  min-width: 0;

  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
    overflow-wrap: anywhere;
  }

  .operation,
  .notice {
    margin: 16px 0;
  }

  .submit {
    margin-top: 16px;
  }
}
</style>

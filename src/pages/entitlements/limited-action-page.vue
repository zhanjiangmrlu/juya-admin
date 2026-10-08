<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
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
const controller = shallowRef(useLimitedEntitlementCommand(createLimitedEntitlementAdapter(client)))
let controllerEntitlementId = entitlementId.value
let requestSequence = 0
onBeforeUnmount(() => {
  requestSequence += 1
})
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
  const sequence = ++requestSequence
  const id = entitlementId.value
  detail.value = null
  confirmVisible.value = false
  if (controllerEntitlementId !== id) {
    controller.value = useLimitedEntitlementCommand(createLimitedEntitlementAdapter(client))
    controllerEntitlementId = id
  }
  if (!keepDraft) {
    commandError.value = null
    commandApiError.value = null
    hadConflict.value = false
  }
  state.value = 'loading'
  error.value = ''
  apiError.value = null
  try {
    const result = await query.limited(id)
    if (sequence !== requestSequence || id !== entitlementId.value) return
    if (result.id !== id) throw new Error('权益详情与当前对象不一致')
    detail.value = result
    if (!keepDraft) operation.value = allowedOperations.value[0] ?? 'PAUSE'
    state.value = 'ready'
  } catch (failure) {
    if (sequence !== requestSequence || id !== entitlementId.value) return
    apiError.value = failure instanceof ApiError ? failure : null
    state.value = 'error'
    error.value = '限时权益详情加载失败，请重试'
  }
}
watch([operation, detail], () => {
  if (!detail.value) return
  controller.value.setDraft({
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
  if (
    state.value !== 'ready' ||
    detail.value?.id !== entitlementId.value ||
    !allowedOperations.value.includes(operation.value)
  )
    return
  const sequence = requestSequence
  try {
    commandError.value = null
    commandApiError.value = null
    hadConflict.value = false
    await controller.value.submit(reason)
    if (sequence !== requestSequence) return
    confirmVisible.value = false
    ElMessage.success('限时权益状态已更新')
    await load()
  } catch (failure) {
    if (sequence !== requestSequence) return
    confirmVisible.value = false
    hadConflict.value = failure instanceof ApiError && failure.status === 409
    commandError.value =
      controller.value.disabledReason.value ?? controller.value.errorMessage.value
    commandApiError.value = controller.value.apiError.value
    if (hadConflict.value) await load(true)
  }
}
</script>

<template>
  <section class="limited-action-page">
    <ElSkeleton v-if="state === 'loading'" :rows="6" animated aria-label="正在加载限时权益" />
    <ElAlert v-if="error" class="notice" :title="error" type="error" :closable="false" show-icon
      ><ApiErrorDetails :error="apiError" /><ElButton size="small" @click="load(true)"
        >重试</ElButton
      ></ElAlert
    >

    <div v-if="detail" class="action-layout">
      <ElCard class="detail-card" shadow="never"
        ><template #header><h3>限时权益状态</h3></template>
        <p class="record-summary">
          <span>权益 {{ entitlementId }}</span
          ><span>{{ detail.userId }} · {{ detail.campaignName }} · {{ detail.campaignId }}</span
          ><span>v{{ detail.version }}</span
          ><span>补救次数 {{ detail.remedyCount }}</span>
        </p>
        <ElDescriptions :column="1" direction="vertical" class="detail-fields"
          ><ElDescriptionsItem label="当前状态">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="活动版本">{{ detail.campaignVersionId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="首次开始时间">{{
            detail.activatedAt ?? '尚未开始'
          }}</ElDescriptionsItem
          ><ElDescriptionsItem label="启动截止">{{ detail.startDeadline }}</ElDescriptionsItem
          ><ElDescriptionsItem label="到期时间">{{
            detail.expiresAt ?? '尚未开始'
          }}</ElDescriptionsItem></ElDescriptions
        ></ElCard
      >
      <ElCard class="operation-card" shadow="never"
        ><template #header
          ><div class="card-heading">
            <h3>状态操作</h3>
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
              ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
            >
          </div></template
        ><ElFormItem class="operation" label="服务端允许的操作"
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
        <div class="check-items">
          <div class="check-item">
            <strong>核对权益</strong><span>核对当前用户、活动版本和启动截止时间。</span>
          </div>
          <div class="check-item">
            <strong>二次确认</strong><span>选择服务端当前允许的操作，核对状态变更范围。</span>
          </div>
          <div class="check-item">
            <strong>审计记录</strong><span>操作原因和操作人进入审计；保留学习记录。</span>
          </div>
        </div>
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
      </ElCard>
    </div>
    <aside class="management-note">
      <strong>管理提醒</strong>
      <p>限时权益结束后用户保留学习记录；受限正文按权限回退。</p>
    </aside>
    <ConfirmDialog
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

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .toolbar p {
    margin: 0;
    color: #657a68;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 0;
    color: #244633;
    font-size: 20px;
  }

  .action-layout {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
  }

  .detail-card,
  .operation-card {
    min-width: 0;
    min-height: 570px;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
  }

  .detail-card {
    background: #eaf2e3;
  }

  :deep([class~='el-card__header']) {
    padding: 18px 20px 12px;
    border-bottom: 0;
  }

  :deep([class~='el-card__body']) {
    padding: 12px 20px 20px;
  }

  .detail-fields :deep([class~='el-descriptions__body']) {
    background: transparent;
  }

  .detail-fields :deep([class~='el-descriptions__label']) {
    display: block;
    padding: 0 0 6px;
    font-weight: 500;
    line-height: 22px;
    color: #657a68;
    font-size: 13px;
  }

  .detail-fields :deep([class~='el-descriptions__content']) {
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
    overflow-wrap: anywhere;
  }

  .form {
    display: flex;
    flex-direction: column;
    min-height: 480px;
  }

  .grid {
    display: grid;
    gap: 0;
  }

  .operation-card :deep(.el-select) {
    width: 100%;
  }

  .operation-card :deep([class~='el-form-item__label']) {
    color: #657a68;
    font-size: 13px;
  }

  .operation-card :deep([class~='el-card__body']) {
    display: flex;
    min-height: 508px;
    box-sizing: border-box;
    flex-direction: column;
  }

  .operation {
    display: block;
    margin: 8px 0 24px;
  }

  .operation :deep([class~='el-form-item__label']) {
    margin-bottom: 8px;
  }

  .operation :deep([class~='el-form-item__content']) {
    margin-left: 0;
  }

  .notice {
    margin: 16px 0;
  }

  .check-items {
    display: grid;
    gap: 28px;
    margin: 24px 0 36px;
  }

  .check-item {
    padding-left: 16px;
    border-left: 5px solid #4f833d;
  }

  .check-item:nth-child(2) {
    border-left-color: #b37b32;
  }

  .check-item strong,
  .check-item span {
    display: block;
  }

  .check-item strong {
    color: #244633;
    font-size: 13px;
  }

  .check-item span {
    margin-top: 7px;
    color: #657a68;
    font-size: 12px;
    line-height: 1.6;
  }

  .submit {
    align-self: flex-start;
    min-height: 44px;
    margin-top: auto;
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
  .limited-action-page {
    .action-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .toolbar {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
  }
}
</style>

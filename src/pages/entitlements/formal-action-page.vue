<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import { createFormalEntitlementAdapter } from '@/features/entitlements/formal-entitlement-adapter'
import {
  FORMAL_OPERATION_LABELS,
  FORMAL_TERM_LABELS,
  FORMAL_TERMS
} from '@/features/entitlements/formal-entitlement-model'
import { useFormalEntitlementCommand } from '@/features/entitlements/use-formal-entitlement-command'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

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
const allowedOperations = computed(() =>
  (detail.value?.availableOperations ?? []).filter(
    (value): value is FormalEntitlementOperation => value in FORMAL_OPERATION_LABELS
  )
)
/**
 * 加载正式权益详情。
 * @param keepDraft - 是否保留目标操作与期限
 * @returns 加载完成的 Promise
 */
async function load(keepDraft = false): Promise<void> {
  const sequence = ++requestSequence
  const id = entitlementId.value
  detail.value = null
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
      form.operation = allowedOperations.value[0] ?? 'RENEW'
      form.term = FORMAL_TERMS.find((value) => value === detail.value?.term) ?? 'month_3'
    }
    state.value = 'ready'
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
      term: form.operation === 'RENEW' || form.operation === 'GRANT' ? form.term : null,
      userId: detail.value.userId
    })
  },
  { deep: true }
)
watch(
  entitlementId,
  () => {
    void load()
  },
  { immediate: true }
)
/**
 * 获取正式权益服务端预览。
 * @returns 服务端预览完成后的 Promise
 */
async function preview(): Promise<void> {
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
    await controller.value.preview()
    if (sequence !== requestSequence) return
    confirmVisible.value = true
  } catch {
    /* 控制器显示错误 */
  }
}
/**
 * 确认正式权益命令。
 * @param reason - 审计原因
 * @returns 命令完成后的 Promise
 */
async function confirm(reason: string): Promise<void> {
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
    confirmVisible.value = false
    hadConflict.value = controller.value.hasConflict.value
    commandError.value = controller.value.errorMessage.value
    commandApiError.value = controller.value.apiError.value
    if (hadConflict.value) await load(true)
  }
}
</script>

<template>
  <section class="formal-action-page admin-brand-headings">
    <ElSkeleton v-if="state === 'loading'" :rows="6" animated aria-label="正在加载正式权益" />
    <ElAlert v-if="error" class="notice" :title="error" type="error" :closable="false" show-icon
      ><ApiErrorDetails :error="apiError" /><ElButton size="small" @click="load(true)"
        >重试</ElButton
      ></ElAlert
    >

    <div v-if="detail" class="action-layout">
      <AdminPanel :title="ADMIN_SECTION_TITLES.formalAction.detailCard" class="detail-card">
        <p class="record-summary">
          <span>权益 {{ entitlementId }}</span
          ><span>{{ detail.userId }} · {{ detail.packageName }} · {{ detail.packageId }}</span
          ><span>v{{ detail.version }}</span>
        </p>
        <ElDescriptions :column="1" direction="vertical" class="detail-fields"
          ><ElDescriptionsItem label="当前状态">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="当前期限">{{ detail.term }}</ElDescriptionsItem
          ><ElDescriptionsItem label="生效时间">{{ detail.grantedAt }}</ElDescriptionsItem
          ><ElDescriptionsItem label="到期时间">{{
            detail.expiresAt ?? '永久有效'
          }}</ElDescriptionsItem></ElDescriptions
        ></AdminPanel
      >
      <AdminPanel class="operation-card"
        ><template #header
          ><div class="card-heading">
            <h3>操作确认</h3>
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
              ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
            >
          </div></template
        ><ElForm class="form" label-position="top" @submit.prevent="preview"
          ><div class="grid">
            <ElFormItem label="可执行操作" required
              ><ElSelect v-model="form.operation" :disabled="allowedOperations.length === 0"
                ><ElOption
                  v-for="operation in allowedOperations"
                  :key="operation"
                  :label="FORMAL_OPERATION_LABELS[operation]"
                  :value="operation" /></ElSelect></ElFormItem
            ><ElFormItem
              v-if="form.operation === 'RENEW' || form.operation === 'GRANT'"
              label="目标期限"
              required
              ><ElSelect v-model="form.term"
                ><ElOption
                  v-for="term in FORMAL_TERMS"
                  :key="term"
                  :label="FORMAL_TERM_LABELS[term]"
                  :value="term" /></ElSelect
            ></ElFormItem>
          </div>
          <ElAlert
            v-if="commandError || controller.errorMessage.value"
            class="notice"
            :title="commandError ?? controller.errorMessage.value ?? ''"
            type="error"
            :closable="false"
            show-icon
            ><ApiErrorDetails :error="commandApiError ?? controller.apiError.value" /><template
              v-if="hadConflict"
              ><p>
                原操作输入已保留。服务端最新版本：{{
                  state === 'ready' ? `v${detail.version}` : '暂未获取，请刷新'
                }}，请核对当前状态并重新预览。
              </p>
              <ElButton size="small" @click="load(true)">刷新服务端信息</ElButton></template
            ></ElAlert
          >
          <ElDescriptions v-if="controller.previewResult.value" :column="2" border
            ><ElDescriptionsItem label="目标状态">{{
              controller.previewResult.value.status
            }}</ElDescriptionsItem
            ><ElDescriptionsItem label="操作后到期时间">{{
              controller.previewResult.value.expiresAt ?? '永久有效'
            }}</ElDescriptionsItem></ElDescriptions
          >
          <div class="check-items">
            <div class="check-item">
              <strong>核对权益</strong><span>核对当前用户、内容包和旧到期时间。</span>
            </div>
            <div class="check-item">
              <strong>二次确认</strong><span>操作后的状态与到期时间以服务端预览为准。</span>
            </div>
            <div class="check-item">
              <strong>审计记录</strong><span>操作原因和操作人进入审计；保留学习记录。</span>
            </div>
          </div>
          <ElButton
            class="submit"
            native-type="submit"
            type="primary"
            :disabled="!allowedOperations.includes(form.operation)"
            :loading="controller.commandState.value === 'submitting'"
            >获取服务端预览并二次确认</ElButton
          >
        </ElForm></AdminPanel
      >
    </div>
    <aside class="management-note">
      <strong>管理提醒</strong>
      <p>时间档位仅支持 1、2、3、6、12 个月或永久。</p>
    </aside>
    <ConfirmDialog
      v-if="detail && controller.previewResult.value"
      v-model="confirmVisible"
      :before-status="detail.status"
      :after-status="controller.previewResult.value.status"
      :impact-scope="`${FORMAL_OPERATION_LABELS[form.operation]}正式权益，影响用户 ${detail.userId} 的内容包 ${detail.packageId}`"
      :object-id="entitlementId"
      title="确认正式权益状态操作"
      :submitting="controller.commandState.value === 'submitting'"
      @confirm="confirm"
    />
  </section>
</template>
<style scoped lang="scss">
.formal-action-page {
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
  .formal-action-page {
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

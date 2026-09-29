<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
const controller = useFormalEntitlementCommand(createFormalEntitlementAdapter(client))
const detail = ref<FormalDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const commandError = ref<string | null>(null)
const hadConflict = ref(false)
const form = reactive({
  operation: 'RENEW' as FormalEntitlementOperation,
  term: 'MONTH_3' as FormalEntitlementTerm
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
  state.value = 'loading'
  error.value = ''
  try {
    detail.value = await query.formal(entitlementId.value)
    if (!keepDraft) {
      form.operation = allowedOperations.value[0] ?? 'RENEW'
      form.term = FORMAL_TERMS.find((value) => value === detail.value?.term) ?? 'MONTH_3'
    }
    state.value = 'ready'
  } catch {
    state.value = 'error'
    error.value = '正式权益详情加载失败，请重试'
  }
}
watch(
  [form, detail],
  () => {
    if (!detail.value) return
    controller.setDraft({
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
  commandError.value = null
  hadConflict.value = false
  try {
    await controller.preview()
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
  try {
    await controller.submit(reason)
    confirmVisible.value = false
    ElMessage.success('正式权益状态已更新')
    await load()
  } catch {
    confirmVisible.value = false
    hadConflict.value = controller.hasConflict.value
    commandError.value = controller.errorMessage.value
    if (hadConflict.value) await load(true)
  }
}
</script>

<template>
  <section class="formal-action-page">
    <ElCard shadow="never"
      ><template #header
        ><div class="heading">
          <div>
            <span>A08</span>
            <h2>正式权益操作 · {{ entitlementId }}</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
            ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
          >
        </div></template
      >
      <ElSkeleton v-if="state === 'loading'" :rows="6" animated aria-label="正在加载正式权益" />
      <ElAlert v-if="error" class="notice" :title="error" type="error" :closable="false" show-icon
        ><ElButton size="small" @click="load(true)">重试</ElButton></ElAlert
      >
      <template v-if="detail"
        ><ElDescriptions :column="2" border
          ><ElDescriptionsItem label="用户编号">{{ detail.userId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="内容包"
            >{{ detail.packageName }} · {{ detail.packageId }}</ElDescriptionsItem
          ><ElDescriptionsItem label="当前状态">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="当前期限">{{ detail.term }}</ElDescriptionsItem
          ><ElDescriptionsItem label="到期时间">{{
            detail.expiresAt ?? '永久有效'
          }}</ElDescriptionsItem
          ><ElDescriptionsItem label="服务端版本"
            >v{{ detail.version }}</ElDescriptionsItem
          ></ElDescriptions
        >
        <ElForm class="form" label-position="top" @submit.prevent="preview"
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
            ><template v-if="hadConflict"
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
          <ElButton
            class="submit"
            native-type="submit"
            type="primary"
            :disabled="!allowedOperations.includes(form.operation)"
            :loading="controller.commandState.value === 'submitting'"
            >获取服务端预览并二次确认</ElButton
          >
        </ElForm></template
      > </ElCard
    ><ConfirmDialog
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

  .form {
    margin-top: 18px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .notice {
    margin: 16px 0;
  }

  .submit {
    margin-top: 16px;
  }
}
</style>

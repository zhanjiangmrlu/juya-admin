<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFormalEntitlementAdapter } from '@/features/entitlements/formal-entitlement-adapter'
import {
  FORMAL_OPERATION_LABELS,
  FORMAL_TERM_LABELS,
  FORMAL_TERMS,
  getFormalOperations
} from '@/features/entitlements/formal-entitlement-model'
import { useFormalEntitlementCommand } from '@/features/entitlements/use-formal-entitlement-command'
import { createApiClient } from '@/services/api/api-client'

import type {
  FormalEntitlementOperation,
  FormalEntitlementStatus,
  FormalEntitlementTerm
} from '@/features/entitlements/formal-entitlement-model'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entitlementId = computed(() => String(route.params.id))
const form = reactive({
  currentStatus: 'ACTIVE' as FormalEntitlementStatus,
  currentTerm: 'MONTH_3' as FormalEntitlementTerm,
  operation: 'RENEW' as FormalEntitlementOperation,
  packageId: '',
  term: 'MONTH_3' as FormalEntitlementTerm,
  userId: ''
})
const isConfirmVisible = ref(false)
const allowedOperations = computed(() => getFormalOperations(form.currentStatus, form.currentTerm))
const controller = useFormalEntitlementCommand(
  createFormalEntitlementAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      getCsrfToken: () => authStore.csrfToken,
      onUnauthorized: () => {
        authStore.clearSensitiveState()
        void router.replace({ name: 'login' })
      }
    })
  )
)

watch(allowedOperations, (operations) => {
  if (!operations.includes(form.operation)) form.operation = operations[0] ?? 'GRANT'
})
watch(
  form,
  () => {
    controller.setDraft({
      operation: form.operation,
      packageId: form.packageId.trim(),
      term: form.operation === 'RENEW' || form.operation === 'GRANT' ? form.term : null,
      userId: form.userId.trim()
    })
  },
  { deep: true, immediate: true }
)

/**
 * 获取服务端操作预览并打开正式权益二次确认。
 *
 * @returns 预览流程完成后的 Promise。
 */
async function handlePreview(): Promise<void> {
  if (!form.userId.trim() || !form.packageId.trim()) return
  try {
    await controller.preview()
    isConfirmVisible.value = true
  } catch {
    // 控制器负责提供可展示错误文案。
  }
}

/**
 * 提交管理员确认后的正式权益状态操作。
 *
 * @param reason - 必填审计原因。
 * @returns 命令提交完成后的 Promise。
 */
async function handleConfirm(reason: string): Promise<void> {
  try {
    await controller.submit(reason)
    isConfirmVisible.value = false
    ElMessage.success('正式权益状态已更新')
  } catch {
    isConfirmVisible.value = false
  }
}
</script>

<template>
  <section class="formal-action-page">
    <ElCard shadow="never">
      <template #header>
        <div class="formal-action-page__heading">
          <div>
            <span>A08</span>
            <h2>正式权益操作 · {{ entitlementId }}</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }">
            <ElButton @click="navigate">返回权益中心</ElButton>
          </RouterLink>
        </div>
      </template>

      <ElAlert
        class="formal-action-page__notice"
        :closable="false"
        title="单条权益详情接口待接入，请以后台记录核对用户、内容包、当前状态和期限；提交前服务端会再次校验"
        type="warning"
        show-icon
      />

      <ElForm label-position="top" @submit.prevent="handlePreview">
        <div class="formal-action-page__grid">
          <ElFormItem label="用户编号" required
            ><ElInput v-model="form.userId" maxlength="64"
          /></ElFormItem>
          <ElFormItem label="内容包编号" required
            ><ElInput v-model="form.packageId" maxlength="64"
          /></ElFormItem>
          <ElFormItem label="已核对当前状态" required>
            <ElSelect v-model="form.currentStatus">
              <ElOption label="生效中" value="ACTIVE" /><ElOption label="已暂停" value="PAUSED" />
              <ElOption label="已撤销" value="REVOKED" /><ElOption label="已到期" value="EXPIRED" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="已核对当前期限" required>
            <ElSelect v-model="form.currentTerm">
              <ElOption
                v-for="term in FORMAL_TERMS"
                :key="term"
                :label="FORMAL_TERM_LABELS[term]"
                :value="term"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="可执行操作" required>
            <ElSelect v-model="form.operation">
              <ElOption
                v-for="operation in allowedOperations"
                :key="operation"
                :label="FORMAL_OPERATION_LABELS[operation]"
                :value="operation"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            v-if="form.operation === 'RENEW' || form.operation === 'GRANT'"
            label="目标期限"
            required
          >
            <ElSelect v-model="form.term">
              <ElOption
                v-for="term in FORMAL_TERMS"
                :key="term"
                :label="FORMAL_TERM_LABELS[term]"
                :value="term"
              />
            </ElSelect>
          </ElFormItem>
        </div>

        <ElAlert
          v-if="controller.errorMessage.value"
          class="formal-action-page__notice"
          :closable="false"
          :title="controller.errorMessage.value"
          type="error"
          show-icon
        >
          <template v-if="controller.hasConflict.value" #default>
            <ElButton size="small" @click="controller.refreshPreview">刷新服务端预览</ElButton>
          </template>
        </ElAlert>

        <ElDescriptions v-if="controller.previewResult.value" :column="3" border>
          <ElDescriptionsItem label="目标状态">{{
            controller.previewResult.value.status
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="目标期限">{{
            FORMAL_TERM_LABELS[controller.previewResult.value.term]
          }}</ElDescriptionsItem>
          <ElDescriptionsItem label="服务端版本"
            >v{{ controller.previewResult.value.version }}</ElDescriptionsItem
          >
        </ElDescriptions>

        <ElButton
          class="formal-action-page__submit"
          :disabled="!form.userId.trim() || !form.packageId.trim()"
          native-type="submit"
          type="primary"
        >
          获取服务端预览并二次确认
        </ElButton>
      </ElForm>
    </ElCard>

    <ConfirmDialog
      v-if="controller.previewResult.value"
      v-model="isConfirmVisible"
      :after-status="controller.previewResult.value.status"
      :before-status="form.currentStatus"
      :impact-scope="`${FORMAL_OPERATION_LABELS[form.operation]}正式权益，服务端将重新校验状态`"
      :object-id="entitlementId"
      title="确认正式权益状态操作"
      @confirm="handleConfirm"
    />
  </section>
</template>

<style scoped lang="scss">
.formal-action-page {
  &__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  &__heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  &__heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  &__notice {
    margin-bottom: 16px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 14px;
  }

  &__submit {
    margin-top: 16px;
  }
}
</style>

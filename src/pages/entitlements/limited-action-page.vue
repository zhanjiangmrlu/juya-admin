<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createLimitedEntitlementAdapter } from '@/features/entitlements/limited-entitlement-adapter'
import {
  getLimitedOperations,
  LIMITED_OPERATION_LABELS
} from '@/features/entitlements/limited-entitlement-model'
import { useLimitedEntitlementCommand } from '@/features/entitlements/use-limited-entitlement-command'
import { createApiClient } from '@/services/api/api-client'

import type {
  LimitedEntitlementOperation,
  LimitedEntitlementStatus
} from '@/features/entitlements/limited-entitlement-model'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entitlementId = computed(() => String(route.params.id))
const form = reactive({
  operation: 'EXTEND_START_DEADLINE' as LimitedEntitlementOperation,
  remedyCount: 0,
  status: 'PENDING' as LimitedEntitlementStatus
})
const isConfirmVisible = ref(false)
const allowedOperations = computed(() =>
  getLimitedOperations({ remedyCount: form.remedyCount, status: form.status })
)
const controller = useLimitedEntitlementCommand(
  createLimitedEntitlementAdapter(
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
  if (!operations.includes(form.operation)) form.operation = operations[0] ?? 'REVOKE'
})
watch(
  form,
  () => {
    controller.setDraft({
      campaignVersionId: null,
      entitlementId: entitlementId.value,
      operation: form.operation,
      userId: null
    })
  },
  { deep: true, immediate: true }
)

/**
 * 打开限时权益高风险操作确认弹窗。
 *
 * @returns 无返回值。
 */
function openConfirmation(): void {
  isConfirmVisible.value = true
}

/**
 * 提交限时权益状态操作并展示服务端结果。
 *
 * @param reason - 管理员填写的审计原因。
 * @returns 命令提交完成后的 Promise。
 */
async function handleConfirm(reason: string): Promise<void> {
  try {
    await controller.submit(reason)
    isConfirmVisible.value = false
    ElMessage.success('限时权益操作已完成')
  } catch {
    isConfirmVisible.value = false
  }
}

/**
 * 根据操作给出确认后的目标状态说明。
 *
 * @param operation - 当前选择的限时权益操作。
 * @returns 面向管理员的目标状态文案。
 */
function getTargetStatus(operation: LimitedEntitlementOperation): string {
  const statuses: Readonly<Record<LimitedEntitlementOperation, string>> = {
    EXTEND_START_DEADLINE: '待开始（截止时间延长）',
    GRANT: '待开始',
    PAUSE: '已暂停',
    RESTORE_START_WINDOW: '待开始（窗口恢复）',
    RESUME: '学习中',
    REVOKE: '已撤销'
  }
  return statuses[operation]
}
</script>

<template>
  <section class="limited-action-page">
    <ElCard shadow="never">
      <template #header>
        <div class="limited-action-page__heading">
          <div>
            <span>A09</span>
            <h2>限时权益操作 · {{ entitlementId }}</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }">
            <ElButton @click="navigate">返回权益中心</ElButton>
          </RouterLink>
        </div>
      </template>

      <ElAlert
        class="limited-action-page__notice"
        :closable="false"
        title="单条限时权益详情接口待接入；请先核对当前状态与补救次数，提交时服务端会重新校验"
        type="warning"
        show-icon
      />

      <div class="limited-action-page__grid">
        <ElFormItem label="已核对当前状态">
          <ElSelect v-model="form.status">
            <ElOption label="待开始" value="PENDING" /><ElOption label="学习中" value="ACTIVE" />
            <ElOption label="已暂停" value="PAUSED" /><ElOption
              label="启动已过期"
              value="START_EXPIRED"
            />
            <ElOption label="已撤销" value="REVOKED" /><ElOption label="已到期" value="EXPIRED" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="已使用补救次数"
          ><ElInputNumber v-model="form.remedyCount" :max="1" :min="0"
        /></ElFormItem>
        <ElFormItem label="当前可执行操作">
          <ElSelect v-model="form.operation" :disabled="allowedOperations.length === 0">
            <ElOption
              v-for="operation in allowedOperations"
              :key="operation"
              :label="LIMITED_OPERATION_LABELS[operation]"
              :value="operation"
            />
          </ElSelect>
        </ElFormItem>
      </div>

      <ElAlert
        v-if="controller.disabledReason.value || controller.errorMessage.value"
        class="limited-action-page__notice"
        :closable="false"
        :title="controller.disabledReason.value ?? controller.errorMessage.value ?? ''"
        type="error"
        show-icon
      />

      <ElDescriptions v-if="controller.result.value" :column="3" border>
        <ElDescriptionsItem label="结果状态">{{
          controller.result.value.status
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="启动截止">{{
          controller.result.value.startDeadline
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="补救次数">{{
          controller.result.value.remedyCount
        }}</ElDescriptionsItem>
      </ElDescriptions>

      <ElButton
        class="limited-action-page__submit"
        :disabled="allowedOperations.length === 0 || Boolean(controller.disabledReason.value)"
        :loading="controller.commandState.value === 'submitting'"
        type="primary"
        @click="openConfirmation"
      >
        二次确认并执行
      </ElButton>
    </ElCard>

    <ConfirmDialog
      v-model="isConfirmVisible"
      :after-status="getTargetStatus(form.operation)"
      :before-status="form.status"
      :impact-scope="`${LIMITED_OPERATION_LABELS[form.operation]}限时权益，服务端将重新校验状态与补救次数`"
      :object-id="entitlementId"
      title="确认限时权益操作"
      @confirm="handleConfirm"
    />
  </section>
</template>

<style scoped lang="scss">
.limited-action-page {
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  &__submit {
    margin-top: 16px;
  }
}
</style>

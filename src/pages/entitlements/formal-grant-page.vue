<script setup lang="ts">
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createFormalEntitlementAdapter } from '@/features/entitlements/formal-entitlement-adapter'
import {
  FORMAL_OPERATION_LABELS,
  FORMAL_TERM_LABELS,
  FORMAL_TERMS
} from '@/features/entitlements/formal-entitlement-model'
import { useFormalEntitlementCommand } from '@/features/entitlements/use-formal-entitlement-command'
import { createApiClient } from '@/services/api/api-client'

import type { FormalEntitlementTerm } from '@/features/entitlements/formal-entitlement-model'

interface GrantForm {
  operation: 'GRANT' | 'RENEW'
  packageId: string
  term: FormalEntitlementTerm
  userId: string
}

const router = useRouter()
const authStore = useAuthStore()
const form = reactive<GrantForm>({
  operation: 'GRANT',
  packageId: '',
  term: 'MONTH_3',
  userId: ''
})
const isConfirmVisible = ref(false)
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

watch(
  form,
  () => {
    controller.setDraft({
      operation: form.operation,
      packageId: form.packageId.trim(),
      term: form.term,
      userId: form.userId.trim()
    })
  },
  { deep: true, immediate: true }
)

/**
 * 请求服务端预览授予或续期结果并打开二次确认
 *
 * @returns 预览流程完成后的 Promise
 */
async function handlePreview(): Promise<void> {
  if (!form.userId.trim() || !form.packageId.trim()) return
  try {
    await controller.preview()
    isConfirmVisible.value = true
  } catch {
    // 控制器已提供安全错误文案，页面不重复弹出异常细节
  }
}

/**
 * 使用管理员填写的审计原因提交正式权益命令
 *
 * @param reason - 二次确认弹窗中的必填原因
 * @returns 命令提交完成后的 Promise
 */
async function handleConfirm(reason: string): Promise<void> {
  try {
    await controller.submit(reason)
    isConfirmVisible.value = false
    ElMessage.success('正式权益操作已完成')
  } catch {
    isConfirmVisible.value = false
  }
}

/**
 * 格式化服务端返回的时间，不执行任何到期时间计算
 *
 * @param value - ISO 8601 时间或永久权益的空值
 * @returns 本地展示时间或“永久有效”
 */
function formatServerTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '永久有效'
}
</script>

<template>
  <section class="formal-grant-page">
    <ElCard shadow="never">
      <template #header>
        <div class="heading">
          <div>
            <span>A06</span>
            <h2>授予正式内容包</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }">
            <ElButton @click="navigate">返回权益中心</ElButton>
          </RouterLink>
        </div>
      </template>

      <ElForm label-position="top" @submit.prevent="handlePreview">
        <div class="form-grid">
          <ElFormItem label="操作类型" required>
            <ElSelect v-model="form.operation">
              <ElOption label="首次授予或重新授予" value="GRANT" />
              <ElOption label="续期" value="RENEW" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="用户编号" required>
            <ElInput v-model="form.userId" maxlength="64" placeholder="输入用户编号" />
          </ElFormItem>
          <ElFormItem label="正式内容包编号" required>
            <ElInput v-model="form.packageId" maxlength="64" placeholder="输入内容包编号" />
          </ElFormItem>
          <ElFormItem label="有效期" required>
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
          class="alert"
          :closable="false"
          :title="controller.errorMessage.value"
          type="error"
          show-icon
        >
          <template v-if="controller.hasConflict.value" #default>
            <ElButton size="small" @click="controller.refreshPreview">刷新服务端预览</ElButton>
          </template>
        </ElAlert>

        <div v-if="controller.previewResult.value" class="preview">
          <div><span>当前期限</span><strong>由服务端当前状态校验</strong></div>
          <div>
            <span>生效时间</span
            ><strong>{{ formatServerTime(controller.previewResult.value.grantedAt) }}</strong>
          </div>
          <div>
            <span>操作后到期时间</span
            ><strong>{{ formatServerTime(controller.previewResult.value.expiresAt) }}</strong>
          </div>
        </div>

        <ElButton
          :disabled="!form.userId.trim() || !form.packageId.trim()"
          :loading="controller.commandState.value === 'submitting'"
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
      before-status="由服务端当前状态校验"
      :impact-scope="`${FORMAL_OPERATION_LABELS[form.operation]}内容包 ${form.packageId}`"
      :object-id="`${form.userId} · ${form.packageId}`"
      title="确认正式权益操作"
      @confirm="handleConfirm"
    />
  </section>
</template>

<style scoped lang="scss">
.formal-grant-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 14px;
  }

  .alert {
    margin-bottom: 16px;
  }

  .preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }

  .preview div {
    padding: 12px;
    border-radius: var(--juya-control-radius);
    background: #f4f5f1;
  }

  .preview span,
  .preview strong {
    display: block;
  }

  .preview span {
    margin-bottom: 6px;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }

  .preview strong {
    color: var(--juya-color-sidebar);
    font-size: 13px;
  }
}
</style>

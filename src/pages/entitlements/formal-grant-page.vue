<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import EntitlementPreviewDialog from '@/features/entitlements/entitlement-preview-dialog.vue'
import { createEntitlementQueryAdapter } from '@/features/entitlements/entitlement-query-adapter'
import EntitlementUserSelector from '@/features/entitlements/entitlement-user-selector.vue'
import { createFormalEntitlementAdapter } from '@/features/entitlements/formal-entitlement-adapter'
import { FORMAL_TERM_LABELS, FORMAL_TERMS } from '@/features/entitlements/formal-entitlement-model'
import { useFormalEntitlementCommand } from '@/features/entitlements/use-formal-entitlement-command'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { ContentPackage } from '@/features/entitlements/entitlement-query-adapter'
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
  term: 'month_3',
  userId: ''
})
const isConfirmVisible = ref(false)
const confirmationReason = ref('')
const conflictMessage = ref<string | null>(null)
const conflictError = shallowRef<ApiError | null>(null)
const packageError = shallowRef<ApiError | null>(null)
const packages = ref<ContentPackage[]>([])
const packagePage = ref(1)
const packagePageSize = ref(10)
const packageTotal = ref(0)
const packageState = ref<'loading' | 'error' | 'ready'>('loading')
const queryAdapter = createEntitlementQueryAdapter(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    getCsrfToken: () => authStore.csrfToken,
    onUnauthorized: () => {
      authStore.clearSensitiveState()
      void router.replace({ name: 'login' })
    }
  })
)
const /**
   * 加载服务端内容包分页。
   * @param page - 页码
   * @returns 加载完成的 Promise
   */
  loadPackages = async (page = 1): Promise<void> => {
    packageState.value = 'loading'
    packageError.value = null
    try {
      const result = await queryAdapter.packages(page, packagePageSize.value)
      packages.value = result.items
      packagePage.value = result.page
      packageTotal.value = result.total
      packageState.value = 'ready'
    } catch (failure) {
      packageError.value = failure instanceof ApiError ? failure : null
      packageState.value = 'error'
    }
  }
void loadPackages()
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

const /**
   * 请求服务端预览授予或续期结果并打开二次确认
   *
   * @returns 预览流程完成后的 Promise
   */
  handlePreview = async (): Promise<void> => {
    if (!form.userId.trim() || !form.packageId.trim()) return
    conflictMessage.value = null
    conflictError.value = null
    try {
      await controller.preview()
      isConfirmVisible.value = true
    } catch {
      // 控制器已提供安全错误文案，页面不重复弹出异常细节
    }
  }

const /**
   * 使用管理员填写的审计原因提交正式权益命令
   *
   * @param reason - 二次确认弹窗中的必填原因
   * @returns 命令提交完成后的 Promise
   */
  handleConfirm = async (reason: string): Promise<void> => {
    try {
      await controller.submit(reason)
      isConfirmVisible.value = false
      ElMessage.success('正式权益操作已完成')
    } catch {
      if (controller.hasConflict.value) {
        isConfirmVisible.value = false
        conflictMessage.value = controller.errorMessage.value
        conflictError.value = controller.apiError.value
      }
    }
  }
</script>

<template>
  <section class="formal-grant-page admin-brand-headings">
    <ElForm class="grant-layout" label-position="top" @submit.prevent="handlePreview">
      <AdminPanel title="开通信息" class="editor-card">
        <div class="form-grid">
          <ElFormItem label="用户编号" required>
            <EntitlementUserSelector v-model="form.userId" />
          </ElFormItem>
          <ElFormItem label="正式内容包" required>
            <ElSelect
              v-model="form.packageId"
              aria-label="正式内容包"
              :loading="packageState === 'loading'"
              placeholder="选择服务端内容包"
              filterable
            >
              <ElOption
                v-for="item in packages"
                :key="item.id"
                :label="item.name"
                :value="item.id"
                :disabled="item.status !== 'ACTIVE'"
              />
            </ElSelect>
            <AppPagination
              v-if="packageTotal > packagePageSize"
              v-model:current-page="packagePage"
              v-model:page-size="packagePageSize"
              :total="packageTotal"
              :disabled="packageState === 'loading'"
              @change="loadPackages"
            />
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
          v-if="conflictMessage"
          class="alert"
          :closable="false"
          :title="conflictMessage"
          type="error"
          show-icon
        >
          <ApiErrorDetails :error="conflictError" />
          原用户、内容包和期限输入已保留，请重新获取操作预览并核对。
        </ElAlert>
        <ElAlert
          v-if="controller.errorMessage.value"
          class="alert"
          :closable="false"
          :title="controller.errorMessage.value"
          type="error"
          show-icon
        >
          <ApiErrorDetails :error="controller.apiError.value" />
          <ElButton v-if="controller.hasConflict.value" @click="handlePreview"
            >刷新服务端预览</ElButton
          >
        </ElAlert>
        <ElAlert
          v-if="packageState === 'error'"
          class="alert"
          title="内容包加载失败，请重试"
          type="error"
          :closable="false"
          ><ApiErrorDetails :error="packageError" /><ElButton @click="loadPackages(packagePage)"
            >重试</ElButton
          ></ElAlert
        >

        <ElFormItem label="备注 · 选填"
          ><ElInput v-model="confirmationReason" placeholder="可补充说明" maxlength="200"
        /></ElFormItem>
      </AdminPanel>
    </ElForm>
    <AppPageActions
      ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
        ><ElButton @click="navigate">返回列表</ElButton></RouterLink
      ><ElButton
        type="primary"
        :disabled="!form.userId.trim() || !form.packageId.trim()"
        :loading="controller.commandState.value === 'submitting'"
        @click="handlePreview"
        >获取操作预览</ElButton
      ></AppPageActions
    >
    <EntitlementPreviewDialog
      v-if="controller.previewResult.value"
      v-model="isConfirmVisible"
      v-model:reason="confirmationReason"
      :before="controller.previewResult.value.before"
      :after="controller.previewResult.value"
      :actual-operation="controller.previewResult.value.actualOperation"
      :expected-version="controller.previewResult.value.expectedVersion"
      :user-label="`用户 ${form.userId}`"
      :user-id="form.userId"
      :content-label="packages.find((item) => item.id === form.packageId)?.name || form.packageId"
      :reason-required="
        !['GRANT', 'RENEW', 'CONVERT_PERMANENT', 'REGRANT'].includes(
          controller.previewResult.value.actualOperation
        )
      "
      :error="controller.errorMessage.value"
      :object-id="`${form.userId} · ${form.packageId}`"
      :submitting="controller.commandState.value === 'submitting'"
      @confirm="handleConfirm"
    />
  </section>
</template>

<style scoped lang="scss">
.formal-grant-page {
  min-width: 0;

  .grant-layout {
    display: block;
  }

  .editor-card {
    background: var(--juya-color-surface);
  }

  .form-grid {
    display: grid;
    gap: 0;
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  .alert {
    margin: 16px 0;
  }
}
</style>

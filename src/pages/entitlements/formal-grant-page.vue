<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
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
import { formatDateTime as formatTimestamp } from '@/shared/utils/date-time'

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
const conflictMessage = ref<string | null>(null)
const conflictError = shallowRef<ApiError | null>(null)
const packageError = shallowRef<ApiError | null>(null)
const projectedVersion = ref<number | null>(null)
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
/**
 * 加载服务端内容包分页。
 * @param page - 页码
 * @returns 加载完成的 Promise
 */
async function loadPackages(page = 1): Promise<void> {
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

/**
 * 请求服务端预览授予或续期结果并打开二次确认
 *
 * @returns 预览流程完成后的 Promise
 */
async function handlePreview(): Promise<void> {
  if (!form.userId.trim() || !form.packageId.trim()) return
  conflictMessage.value = null
  conflictError.value = null
  projectedVersion.value = null
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
    if (controller.hasConflict.value) {
      conflictMessage.value = controller.errorMessage.value
      conflictError.value = controller.apiError.value
      try {
        projectedVersion.value = (await controller.refreshPreview()).version
      } catch {
        // Keep the original draft and conflict message if refresh also fails.
      }
    }
  }
}

/**
 * 格式化服务端返回的时间，不执行任何到期时间计算
 *
 * @param value - ISO 8601 时间或永久权益的空值
 * @returns 本地展示时间或“永久有效”
 */
function formatServerTime(value: string | null): string {
  return formatTimestamp(value, '永久有效')
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
                :label="`${item.name} · ${item.id}`"
                :value="item.id"
                :disabled="item.status !== 'ACTIVE'"
              />
            </ElSelect>
            <AppPagination
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
          原用户、内容包和期限输入已保留。当前版本尚未获取；重新预览的预计操作后版本：{{
            projectedVersion === null ? '暂未获取' : `v${projectedVersion}`
          }}，此预览尚未保存，请重新确认。
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
          <ElButton v-if="controller.hasConflict.value" size="small" @click="handlePreview"
            >刷新服务端预览</ElButton
          >
        </ElAlert>
        <ElAlert
          v-if="packageState === 'error'"
          class="alert"
          title="内容包加载失败，请重试"
          type="error"
          :closable="false"
          ><ApiErrorDetails :error="packageError" /><ElButton
            size="small"
            @click="loadPackages(packagePage)"
            >重试</ElButton
          ></ElAlert
        >

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
      :submitting="controller.commandState.value === 'submitting'"
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

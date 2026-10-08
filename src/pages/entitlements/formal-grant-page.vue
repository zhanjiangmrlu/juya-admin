<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
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
  <section class="formal-grant-page admin-brand-headings">
    <ElForm class="grant-layout" label-position="top" @submit.prevent="handlePreview">
      <AdminPanel :title="ADMIN_SECTION_TITLES.formalGrant.editorCard" class="editor-card">
        <p class="record-summary">核对用户、内容包和新到期日后提交。</p>
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
      </AdminPanel>
      <div class="check-column">
        <AdminPanel class="check-card"
          ><template #header
            ><div class="card-heading">
              <h3>提交核对</h3>
              <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
                ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
              >
            </div></template
          >
          <div class="check-items">
            <div class="check-item">
              <strong>身份</strong><span>提交前核对用户编号与内容包。</span>
            </div>
            <div class="check-item">
              <strong>期限</strong
              ><span>{{ FORMAL_TERM_LABELS[form.term] }}；新到期时间由服务端预览返回。</span>
            </div>
            <div class="check-item">
              <strong>权益冲突</strong
              ><span>检查当前权益状态和到期时间，确认弹窗会再次展示操作对象。</span>
            </div>
          </div></AdminPanel
        >
        <aside class="management-note">
          <strong>提交前确认</strong>
          <p>授予、续期、延期均需二次确认，且保留操作人和时间。</p>
        </aside>
        <div class="submit-row">
          <ElButton
            :disabled="!form.userId.trim() || !form.packageId.trim()"
            :loading="controller.commandState.value === 'submitting'"
            native-type="submit"
            type="primary"
          >
            获取服务端预览并二次确认
          </ElButton>
        </div>
      </div>
    </ElForm>
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
  }

  h3 {
    margin: 0;
    color: #244633;
    font-size: 20px;
  }

  .grant-layout {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    align-items: start;
    gap: 18px;
  }

  .editor-card,
  .check-card {
    min-width: 0;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
  }

  .editor-card {
    min-height: 630px;
    background: #eaf2e3;
  }

  .check-card {
    min-height: 455px;
  }

  :deep([class~='el-card__header']) {
    padding: 18px 20px 12px;
    border-bottom: 0;
  }

  :deep([class~='el-card__body']) {
    padding: 12px 20px 20px;
  }

  .form-grid {
    display: grid;
    gap: 0;
  }

  .editor-card :deep(.el-form-item) {
    margin-bottom: 24px;
  }

  .editor-card :deep([class~='el-form-item__label']) {
    margin-bottom: 6px;
    color: #657a68;
    font-size: 13px;
  }

  .editor-card :deep([class~='el-form-item__content'] > .el-select) {
    width: 100%;
  }

  .notice,
  .alert,
  .summary {
    margin: 16px 0;
  }

  .preview {
    display: grid;
    gap: 16px;
    margin: 18px 0;
  }

  .preview span,
  .preview strong {
    display: block;
  }

  .preview span {
    margin-bottom: 6px;
    color: #657a68;
    font-size: 13px;
  }

  .preview strong {
    padding: 10px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
    color: #244633;
    font-size: 14px;
  }

  .check-items {
    display: grid;
    gap: 32px;
    margin: 28px 0;
  }

  .check-item {
    padding-left: 16px;
    border-left: 5px solid #4f833d;
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
    overflow-wrap: anywhere;
  }

  .check-column {
    min-width: 0;
  }

  .check-column .management-note {
    min-height: 156px;
    box-sizing: border-box;
  }

  .submit-row {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 28px;
  }

  .submit-row .el-button {
    margin: 0;
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
  .formal-grant-page {
    .grant-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .toolbar {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
  }
}

@media (height <= 820px) {
  .formal-grant-page {
    .editor-card {
      min-height: 540px;
    }

    .check-card {
      min-height: 365px;
    }

    .submit-row {
      margin-top: 20px;
    }
  }
}
</style>

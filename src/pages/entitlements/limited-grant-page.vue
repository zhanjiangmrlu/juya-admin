<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { createLimitedEntitlementAdapter } from '@/features/entitlements/limited-entitlement-adapter'
import { useLimitedEntitlementCommand } from '@/features/entitlements/use-limited-entitlement-command'
import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { CampaignDetail, CampaignRow } from '@/features/campaigns/campaign-adapter'

const router = useRouter()
const auth = useAuthStore()
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getCsrfToken: () => auth.csrfToken,
  onUnauthorized: () => {
    auth.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const campaigns = createCampaignAdapter(client)
const controller = useLimitedEntitlementCommand(createLimitedEntitlementAdapter(client))
const form = reactive({ userId: '', campaignId: '' })
const rows = ref<CampaignRow[]>([])
const detail = ref<CampaignDetail | null>(null)
const listPage = ref(1)
const listPageSize = ref(10)
const listTotal = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const apiError = shallowRef<ApiError | null>(null)
const commandApiError = shallowRef<ApiError | null>(null)
const commandError = ref<string | null>(null)
const hadConflict = ref(false)
const confirmVisible = ref(false)
const detailLoading = ref(false)
const detailFresh = ref(false)
let detailSequence = 0
const eligible = computed(
  () =>
    !detailLoading.value &&
    detailFresh.value &&
    detail.value?.id === form.campaignId &&
    detail.value?.status === 'OPEN' &&
    Boolean(detail.value.currentVersion) &&
    (detail.value.currentVersion?.grantedUserCount ?? 0) <
      (detail.value.currentVersion?.capacity ?? 0)
)
/**
 * 加载开放活动分页。
 * @param page - 页码
 * @returns 加载完成的 Promise
 */
async function loadCampaigns(page = 1): Promise<void> {
  state.value = 'loading'
  error.value = ''
  apiError.value = null
  try {
    const result = await campaigns.list(page, 'OPEN', listPageSize.value)
    rows.value = result.items
    listPage.value = result.page
    listTotal.value = result.total
    state.value = 'ready'
  } catch (failure) {
    apiError.value = failure instanceof ApiError ? failure : null
    state.value = 'error'
    error.value = '活动列表加载失败，请重试'
  }
}
/**
 * 加载管理员选择的活动详情。
 * @param id - 活动编号
 * @returns 加载完成的 Promise
 */
async function selectCampaign(id: string): Promise<void> {
  const sequence = ++detailSequence
  detailFresh.value = false
  if (detail.value?.id !== id) detail.value = null
  error.value = ''
  apiError.value = null
  detailLoading.value = Boolean(id)
  if (!id) return
  try {
    const result = await campaigns.detail(id)
    if (sequence !== detailSequence || id !== form.campaignId) return
    if (result.id !== id) throw new Error('活动详情与当前选择不匹配')
    detail.value = result
    detailFresh.value = true
  } catch (failure) {
    if (sequence !== detailSequence || id !== form.campaignId) return
    apiError.value = failure instanceof ApiError ? failure : null
    error.value = '活动详情加载失败，请重新选择或重试'
  } finally {
    if (sequence === detailSequence) detailLoading.value = false
  }
}
watch(
  () => form.campaignId,
  (id) => {
    void selectCampaign(id)
  }
)
watch(
  [() => form.userId, detail],
  () => {
    if (!detail.value || detail.value.id !== form.campaignId) return
    controller.setDraft({
      campaignVersionId: detail.value?.currentVersion?.id ?? null,
      entitlementId: null,
      operation: 'GRANT',
      userId: form.userId.trim() || null
    })
  },
  { immediate: true }
)
/**
 * 提交限时权益开通命令。
 * @returns 开通限时权益完成后的 Promise
 */
async function confirm(): Promise<void> {
  if (!eligible.value) return
  try {
    commandError.value = null
    commandApiError.value = null
    hadConflict.value = false
    await controller.submit('')
    confirmVisible.value = false
    ElMessage.success('限时权益已开通')
    await selectCampaign(form.campaignId)
  } catch (failure) {
    confirmVisible.value = false
    hadConflict.value = failure instanceof ApiError && failure.status === 409
    commandError.value = controller.disabledReason.value ?? controller.errorMessage.value
    commandApiError.value = controller.apiError.value
    if (hadConflict.value) await selectCampaign(form.campaignId)
  }
}
void loadCampaigns()
</script>

<template>
  <section class="limited-grant-page">
    <ElForm class="grant-layout" label-position="top">
      <ElCard class="editor-card" shadow="never"
        ><template #header><h3>开通限时权益</h3></template
        ><ElFormItem label="用户编号" required
          ><ElInput v-model="form.userId" maxlength="64" placeholder="输入用户编号" /></ElFormItem
        ><ElFormItem label="开放中的活动" required
          ><ElSelect
            v-model="form.campaignId"
            :loading="state === 'loading'"
            placeholder="选择服务端活动"
            filterable
            ><ElOption
              v-for="row in rows"
              :key="row.id"
              :label="`${row.name} · ${row.id}`"
              :value="row.id" /></ElSelect></ElFormItem
        ><AppPagination
          v-model:current-page="listPage"
          v-model:page-size="listPageSize"
          :total="listTotal"
          :disabled="state === 'loading'"
          @change="loadCampaigns"
        />
        <ElAlert
          v-if="state === 'error' || error"
          class="notice"
          :title="error"
          type="error"
          :closable="false"
          show-icon
          ><ApiErrorDetails :error="apiError" /><ElButton
            size="small"
            @click="loadCampaigns(listPage)"
            >重新加载活动列表</ElButton
          ><ElButton v-if="form.campaignId" size="small" @click="selectCampaign(form.campaignId)"
            >重新加载活动详情</ElButton
          ></ElAlert
        >
        <ElDescriptions v-if="detail?.currentVersion" :column="2" border class="summary"
          ><ElDescriptionsItem label="当前状态">{{ detail.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="活动版本">{{ detail.currentVersion.id }}</ElDescriptionsItem
          ><ElDescriptionsItem label="容量"
            >{{ detail.currentVersion.grantedUserCount }} /
            {{ detail.currentVersion.capacity }}</ElDescriptionsItem
          ><ElDescriptionsItem label="启动窗口"
            >{{ detail.currentVersion.activationWindowDays }} 天</ElDescriptionsItem
          ><ElDescriptionsItem label="学习时长"
            >{{ detail.currentVersion.durationDays }} 天</ElDescriptionsItem
          ><ElDescriptionsItem label="开放时间"
            >{{ detail.currentVersion.grantStartsAt ?? '—' }} 至
            {{ detail.currentVersion.grantEndsAt ?? '—' }}</ElDescriptionsItem
          ></ElDescriptions
        >
        <ElAlert
          v-if="detail && !eligible"
          class="notice"
          title="活动当前不可开通或容量已满，请选择其他开放活动"
          type="warning"
          :closable="false"
          show-icon
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
            原用户与活动选择已保留。服务端最新版本：{{
              detailFresh && detail ? `v${detail.version}` : '暂未获取，请刷新'
            }}，请核对状态和容量。
          </p>
          <ElButton size="small" @click="selectCampaign(form.campaignId)"
            >刷新活动状态</ElButton
          ></ElAlert
        >
        <ElDescriptions v-if="controller.result.value" :column="2" border class="summary"
          ><ElDescriptionsItem label="权益编号">{{ controller.result.value.id }}</ElDescriptionsItem
          ><ElDescriptionsItem label="目标状态">{{
            controller.result.value.status
          }}</ElDescriptionsItem
          ><ElDescriptionsItem label="启动截止">{{
            controller.result.value.startDeadline
          }}</ElDescriptionsItem></ElDescriptions
        >
      </ElCard>
      <div class="check-column">
        <ElCard class="check-card" shadow="never"
          ><template #header
            ><div class="card-heading">
              <h3>开通核对</h3>
              <RouterLink v-slot="{ navigate }" custom :to="{ name: 'entitlements' }"
                ><ElButton @click="navigate">返回权益中心</ElButton></RouterLink
              >
            </div></template
          >
          <div class="check-items">
            <div class="check-item">
              <strong>容量</strong
              ><span>{{
                detail?.currentVersion
                  ? detail.currentVersion.grantedUserCount + ' / ' + detail.currentVersion.capacity
                  : '请选择活动后核对容量'
              }}</span>
            </div>
            <div class="check-item">
              <strong>活动版本</strong
              ><span>开通将绑定左侧选定的活动版本，请核对版本与开放状态。</span>
            </div>
            <div class="check-item">
              <strong>启动规则</strong
              ><span>首次进入学习才开始倒计时；启动窗口以活动配置为准。</span>
            </div>
          </div></ElCard
        >
        <aside class="management-note">
          <strong>提交前确认</strong>
          <p>超过启动窗口仍未开始时按活动规则处理，可恢复或关闭。</p>
        </aside>
        <div class="submit-row">
          <ElButton
            type="primary"
            class="submit"
            :disabled="
              !form.userId.trim() || !eligible || controller.commandState.value === 'submitting'
            "
            :loading="controller.commandState.value === 'submitting'"
            @click="confirmVisible = true"
            >二次确认并开通</ElButton
          >
        </div>
      </div>
    </ElForm>
    <ConfirmDialog
      v-if="detail?.currentVersion"
      v-model="confirmVisible"
      :before-status="detail.status"
      after-status="开通后的权益状态由服务端返回"
      :impact-scope="`为用户 ${form.userId} 开通活动版本 ${detail.currentVersion.id}`"
      :object-id="form.userId"
      :reason-required="false"
      title="确认开通限时权益"
      :submitting="controller.commandState.value === 'submitting'"
      @confirm="confirm"
    />
  </section>
</template>

<style scoped lang="scss">
.limited-grant-page {
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
    min-height: 44px;
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
  .limited-grant-page {
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
  .limited-grant-page {
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

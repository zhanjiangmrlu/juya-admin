<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminNotice from '@/components/admin-notice/admin-notice.vue'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { validateCapacityLimit } from '@/features/campaigns/campaign-model'
import { useCampaignEditor } from '@/features/campaigns/use-campaign-editor'
import { createApiClient } from '@/services/api/api-client'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const campaignId = computed(() => String(route.params.id))
const editor = useCampaignEditor(
  createCampaignAdapter(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL,
      getCsrfToken: () => auth.csrfToken,
      onUnauthorized: () => {
        auth.clearSensitiveState()
        void router.replace({ name: 'login' })
      }
    })
  )
)
const capacity = ref<number | undefined>()
const confirmVisible = ref(false)
const current = computed(() => editor.server.value?.currentVersion)
const canChangeCapacity = computed(
  () => editor.server.value?.availableOperations.includes('capacity') ?? false
)
const capacityValidation = computed(() =>
  capacity.value === undefined || !current.value
    ? null
    : validateCapacityLimit(current.value.grantedUserCount, capacity.value)
)
watch(
  campaignId,
  (id) => {
    void editor
      .load(id)
      .then((loaded) => {
        if (loaded && id === campaignId.value)
          capacity.value = editor.server.value?.currentVersion?.capacity
      })
      .catch(() => undefined)
  },
  { immediate: true }
)
/**
 * 提交已确认的容量命令。
 * @returns 容量命令完成后的 Promise
 */
async function confirm(): Promise<void> {
  if (capacity.value === undefined || !capacityValidation.value?.valid) return
  try {
    await editor.command('capacity', capacity.value)
    confirmVisible.value = false
    ElMessage.success('容量已更新')
  } catch {
    confirmVisible.value = false
  }
}
</script>

<template>
  <section class="campaign-version-page admin-operations-surface">
    <ElSkeleton
      v-if="editor.state.value === 'loading'"
      :rows="6"
      animated
      aria-label="正在加载活动版本"
    />
    <ElAlert
      v-if="editor.error.value"
      :title="editor.error.value"
      type="error"
      :closable="false"
      show-icon
    >
      <ApiErrorDetails :error="editor.apiError.value" />
      <p v-if="editor.conflict.value">
        原容量输入已保留。服务端最新版本：{{
          editor.conflictVersion.value === null
            ? '暂未获取，请刷新'
            : `v${editor.conflictVersion.value}`
        }}，请核对后重试。
      </p>
      <ElButton size="small" @click="editor.load(campaignId, true).catch(() => undefined)"
        >刷新服务端信息</ElButton
      >
    </ElAlert>
    <div class="grid">
      <AdminPanel class="version-card">
        <template #header
          ><h3>活动版本</h3>
          <p class="panel-subtitle">{{ editor.server.value?.name || campaignId }}</p></template
        >
        <ElEmpty v-if="!current" description="活动尚无当前版本" />
        <ElDescriptions v-else :column="1" border direction="vertical">
          <ElDescriptionsItem label="启用版本"
            ><span>{{ current.id }}</span> · 第 {{ current.versionNo }} 版 ·
            {{ current.status }}</ElDescriptionsItem
          >
          <ElDescriptionsItem label="期限模式"
            >{{ current.durationDays }} 天 · 启动窗口
            {{ current.activationWindowDays }} 天</ElDescriptionsItem
          >
          <ElDescriptionsItem label="场景顺序"
            ><span class="wrap">{{
              current.sceneIds.join(' → ') || '未配置'
            }}</span></ElDescriptionsItem
          >
          <ElDescriptionsItem label="容量上限">{{ current.capacity }}</ElDescriptionsItem>
          <ElDescriptionsItem label="已开通人数">{{ current.grantedUserCount }}</ElDescriptionsItem>
          <ElDescriptionsItem label="开通时间"
            >{{ current.grantStartsAt ?? '—' }} 至
            {{ current.grantEndsAt ?? '—' }}</ElDescriptionsItem
          >
        </ElDescriptions>
      </AdminPanel>
      <AdminPanel class="capacity-card">
        <template #header
          ><h3>容量调整</h3>
          <p class="panel-subtitle">容量不能低于服务端已开通人数</p></template
        >
        <ElDescriptions v-if="current" :column="1" class="summary">
          <ElDescriptionsItem label="当前容量">{{ current.capacity }}</ElDescriptionsItem>
          <ElDescriptionsItem label="已开通人数">{{ current.grantedUserCount }}</ElDescriptionsItem>
          <ElDescriptionsItem label="服务端版本"
            >v{{ editor.server.value?.version }}</ElDescriptionsItem
          >
        </ElDescriptions>
        <ElForm label-position="top"
          ><ElFormItem label="新容量" class="capacity"
            ><ElInputNumber
              :key="String(canChangeCapacity)"
              v-model="capacity"
              :disabled="!current || !canChangeCapacity"
              :min="1" /></ElFormItem
        ></ElForm>
        <ElAlert
          v-if="capacityValidation && !capacityValidation.valid"
          :title="capacityValidation.message"
          type="error"
          :closable="false"
        />
        <ElButton
          type="primary"
          :disabled="
            !current ||
            !canChangeCapacity ||
            !capacityValidation?.valid ||
            capacity === current?.capacity
          "
          :loading="editor.state.value === 'submitting'"
          @click="confirmVisible = true"
          >确认调整容量</ElButton
        >
      </AdminPanel>
    </div>
    <AdminNotice class="notice" title="管理提醒">
      <p>首次开通后锁定期限和场景；容量变更不改写已开通用户的活动版本。</p>
    </AdminNotice>
    <div class="page-toolbar footer-toolbar">
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
        ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
      >
    </div>
    <ConfirmDialog
      v-if="current && editor.server.value"
      v-model="confirmVisible"
      :before-status="`容量 ${current.capacity}`"
      :after-status="`容量 ${capacity ?? current.capacity}`"
      :impact-scope="`已开通 ${current.grantedUserCount} 人；新容量将作用于当前版本`"
      :object-id="current.id"
      :reason-required="false"
      :submitting="editor.state.value === 'submitting'"
      title="确认容量调整"
      @confirm="confirm"
    />
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.campaign-version-page {
  min-width: 0;
  color: var(--juya-color-text-primary);

  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  .page-context {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-text-primary);
    font-size: 20px;
    line-height: 28px;
  }

  .panel-subtitle {
    margin: 8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
    margin-bottom: 18px;
  }

  .grid > * {
    min-width: 0;
    min-height: 570px;
  }

  .version-card {
    background: #eaf2e3;
  }

  .version-card :deep(.el-descriptions__body) {
    background: transparent;
  }

  .version-card :deep(.el-descriptions__table) {
    border-collapse: separate;
    border-spacing: 0 8px;
    background: transparent;
  }

  .version-card :deep(.el-descriptions__label) {
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
    font-weight: 500;
  }

  .version-card :deep(.el-descriptions__content) {
    padding: 8px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
    overflow-wrap: anywhere;
  }

  .capacity-card :deep(.el-descriptions__cell) {
    padding: 16px 0 16px 14px;
    border-left: 5px solid #4f833d;
  }

  .summary {
    margin-top: 14px;
  }

  .capacity {
    margin-top: 30px;
  }

  :deep(.el-input-number) {
    width: 100%;
  }

  .capacity-card :deep(.el-button) {
    min-width: 195px;
    margin-top: 20px;
  }

  .footer-toolbar {
    justify-content: flex-end;
    margin-top: 16px;
  }

  .wrap {
    overflow-wrap: anywhere;
  }

  @media (width <= 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

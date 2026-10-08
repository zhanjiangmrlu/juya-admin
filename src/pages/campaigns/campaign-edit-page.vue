<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminNotice from '@/components/admin-notice/admin-notice.vue'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { useCampaignEditor } from '@/features/campaigns/use-campaign-editor'
import { createApiClient } from '@/services/api/api-client'

import type { CampaignOperation } from '@/features/campaigns/campaign-adapter'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const campaignId = computed(() => String(route.params.id))
const isNew = computed(() => campaignId.value === 'new')
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
const sceneText = ref('')
const confirmVisible = ref(false)
const pendingOperation = ref<Exclude<CampaignOperation, 'capacity'> | 'copy'>('open')
const nextStatus: Record<string, string> = {
  open: 'OPEN',
  pause: 'PAUSED',
  resume: 'OPEN',
  end: 'ENDED',
  archive: 'ARCHIVED',
  copy: 'DRAFT'
}
const availableOperations = computed<(Exclude<CampaignOperation, 'capacity'> | 'copy')[]>(() =>
  (editor.server.value?.availableOperations ?? []).filter((operation) => operation !== 'capacity')
)
const canEdit = computed(() => isNew.value || editor.server.value?.status === 'DRAFT')
watch(
  campaignId,
  (id) => {
    void editor
      .load(id)
      .then((loaded) => {
        if (loaded && id === campaignId.value)
          sceneText.value = editor.draft.value.sceneIds.join('\n')
      })
      .catch(() => undefined)
  },
  { immediate: true }
)
/**
 * 保存活动编辑草稿。
 * @returns 保存完成后的 Promise
 */
async function save(): Promise<void> {
  editor.draft.value.sceneIds = sceneText.value
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (!editor.draft.value.name.trim()) return
  try {
    const result = await editor.save()
    ElMessage.success('活动已保存')
    if (isNew.value) await router.replace({ name: 'campaign-edit', params: { id: result.id } })
  } catch {
    /* 页面保留草稿并展示错误 */
  }
}
/**
 * 打开活动操作确认。
 * @param operation - 服务端允许的操作
 * @returns 无返回值
 */
function ask(operation: Exclude<CampaignOperation, 'capacity'> | 'copy'): void {
  pendingOperation.value = operation
  confirmVisible.value = true
}
/**
 * 执行已确认的活动操作。
 * @returns 活动操作完成后的 Promise
 */
async function confirm(): Promise<void> {
  try {
    if (pendingOperation.value === 'copy') await editor.copy()
    else await editor.command(pendingOperation.value)
    confirmVisible.value = false
    ElMessage.success('活动状态已更新')
  } catch {
    confirmVisible.value = false
  }
}
</script>

<template>
  <section class="campaign-edit-page admin-operations-surface">
    <ElSkeleton
      v-if="editor.state.value === 'loading'"
      :rows="7"
      animated
      aria-label="正在加载活动详情"
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
        草稿已保留。服务端最新版本：{{
          editor.conflictVersion.value === null
            ? '暂未获取，请刷新'
            : `v${editor.conflictVersion.value}`
        }}，请核对后再保存。
      </p>
      <ElButton
        v-if="!isNew"
        size="small"
        @click="editor.load(campaignId, true).catch(() => undefined)"
        >刷新服务端信息</ElButton
      >
    </ElAlert>
    <div class="editor-grid">
      <AdminPanel class="configuration-card">
        <template #header
          ><h3>活动基础配置</h3>
          <p class="panel-subtitle">
            {{ editor.server.value?.name || '新建限时活动' }} ·
            {{ editor.server.value ? `版本 v${editor.server.value.version}` : '草稿' }}
          </p></template
        >
        <ElForm label-position="top" @submit.prevent="save">
          <ElFormItem label="活动名称" required
            ><ElInput
              v-model="editor.draft.value.name"
              :disabled="!canEdit"
              maxlength="200"
              show-word-limit
          /></ElFormItem>
          <ElFormItem label="学习时长" required
            ><ElSelect v-model="editor.draft.value.durationDays" :disabled="!canEdit"
              ><ElOption label="3 天" :value="3" /><ElOption label="5 天" :value="5" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="场景顺序（每行一个场景编号）"
            ><ElInput v-model="sceneText" :disabled="!canEdit" type="textarea" :rows="2"
          /></ElFormItem>
          <ElFormItem label="启动窗口（天）" required
            ><ElInputNumber
              v-model="editor.draft.value.activationWindowDays"
              :disabled="!canEdit"
              :min="1"
          /></ElFormItem>
          <ElFormItem label="容量上限" required
            ><ElInputNumber v-model="editor.draft.value.capacity" :disabled="!canEdit" :min="1"
          /></ElFormItem>
          <ElFormItem label="当前开通人数"
            ><div class="field-value">
              {{ editor.server.value?.currentVersion?.grantedUserCount ?? 0 }} 人
            </div></ElFormItem
          >
          <p v-if="!canEdit" class="hint">
            当前状态
            {{ editor.server.value?.status }}。仅草稿活动可编辑；容量调整请前往版本与容量页。
          </p>
          <div class="save-actions">
            <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
              ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
            >
            <ElButton
              v-if="canEdit"
              :disabled="!editor.draft.value.name.trim()"
              :loading="editor.state.value === 'submitting'"
              native-type="submit"
              type="primary"
              >保存活动</ElButton
            >
          </div>
        </ElForm>
      </AdminPanel>
      <div class="secondary-column">
        <AdminPanel
          :title="ADMIN_SECTION_TITLES.campaignEdit.validationCard"
          class="validation-card"
        >
          <div class="check-item">
            <strong>场景顺序</strong
            ><span>已配置 {{ editor.draft.value.sceneIds.length }} 个场景；保存时校验场景内容</span>
          </div>
          <div class="check-item">
            <strong>版本</strong
            ><span>{{
              editor.server.value
                ? `当前服务端版本 v${editor.server.value.version}`
                : '新建活动保存为草稿'
            }}</span>
          </div>
          <div class="check-item warning">
            <strong>锁定字段</strong><span>首次开通后期限和场景锁定；容量前往版本页调整</span>
          </div>
          <template v-if="editor.server.value">
            <h4>当前状态与操作</h4>
            <ElDescriptions :column="1">
              <ElDescriptionsItem label="当前状态">{{
                editor.server.value.status
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="当前活动版本">{{
                editor.server.value.currentVersion?.id ?? '尚未生成'
              }}</ElDescriptionsItem>
            </ElDescriptions>
            <div class="operations">
              <ElButton
                v-for="operation in availableOperations"
                :key="operation"
                :disabled="editor.state.value === 'submitting'"
                @click="ask(operation)"
                >{{
                  {
                    open: '开放',
                    pause: '暂停',
                    resume: '恢复',
                    end: '结束',
                    archive: '归档',
                    copy: '复制新版本'
                  }[operation]
                }}</ElButton
              >
              <RouterLink :to="{ name: 'campaign-versions', params: { id: campaignId } }"
                ><ElButton>查看版本与容量</ElButton></RouterLink
              >
            </div>
          </template>
        </AdminPanel>
        <AdminNotice class="notice" title="提交前确认">
          <p>首次开通后期限和场景保持锁定。保存与状态操作将核对当前服务端版本。</p>
        </AdminNotice>
      </div>
    </div>
    <ConfirmDialog
      v-if="editor.server.value"
      v-model="confirmVisible"
      :before-status="editor.server.value.status"
      :after-status="nextStatus[pendingOperation] ?? ''"
      :impact-scope="
        pendingOperation === 'copy' ? '复制当前版本并创建草稿版本' : '更改活动及当前版本状态'
      "
      :object-id="campaignId"
      :reason-required="false"
      :submitting="editor.state.value === 'submitting'"
      title="确认活动操作"
      @confirm="confirm"
    />
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- 页面级 Element Plus BEM 覆盖，业务类名遵循仓库命名 */
.campaign-edit-page {
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

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    align-items: start;
    gap: 18px;
  }

  .configuration-card {
    min-height: 630px;
    background: #eaf2e3;
  }

  .secondary-column {
    display: grid;
    gap: 18px;
  }

  .validation-card {
    min-height: 455px;
  }

  :deep(.el-form-item) {
    margin-bottom: 14px;
  }

  :deep(.el-form-item__label) {
    height: 22px;
    padding: 0;
    margin-bottom: 4px;
    line-height: 22px;
  }

  :deep(.el-select),
  :deep(.el-input-number) {
    width: 100%;
  }

  .field-value {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
    font-size: 14px;
    line-height: 22px;
  }

  .check-item {
    display: grid;
    gap: 4px;
    padding-left: 14px;
    margin: 16px 0 30px;
    border-left: 5px solid #4f833d;
    font-size: 13px;
  }

  .check-item span,
  .hint {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  .warning {
    border-color: #b37b32;
  }

  h4 {
    margin: 20px 0 12px;
    font-size: 14px;
  }

  .operations {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  .operations :deep(.el-button) {
    margin-left: 0;
  }

  .configuration-card :deep(.el-card__body) {
    padding-top: 8px;
  }

  .save-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  @media (width <= 900px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }
}
/* stylelint-enable selector-class-pattern */
</style>

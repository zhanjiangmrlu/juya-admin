<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import CampaignCapacityToggle from '@/features/campaigns/campaign-capacity-toggle.vue'
import CampaignSceneSelector from '@/features/campaigns/campaign-scene-selector.vue'
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
const capacityLimited = computed(() => editor.draft.value.capacity !== null)
const validationError = ref('')
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
    void editor.load(id).catch(() => undefined)
  },
  { immediate: true }
)
/**
 * 保存活动编辑草稿。
 * @returns 保存完成后的 Promise
 */
const save = async (): Promise<void> => {
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
const ask = (operation: Exclude<CampaignOperation, 'capacity'> | 'copy'): void => {
  validationError.value = ''
  if (
    operation === 'open' &&
    (editor.draft.value.sceneIds.length !== editor.draft.value.durationDays ||
      new Set(editor.draft.value.sceneIds).size !== editor.draft.value.durationDays)
  ) {
    validationError.value = `启用前需选择 ${editor.draft.value.durationDays} 个不同且可用的已发布场景`
    return
  }
  pendingOperation.value = operation
  confirmVisible.value = true
}
/**
 * 执行已确认的活动操作。
 * @returns 活动操作完成后的 Promise
 */
const confirm = async (): Promise<void> => {
  try {
    if (pendingOperation.value === 'copy') {
      await editor.copy()
      await editor.load(campaignId.value)
    } else await editor.command(pendingOperation.value)
    confirmVisible.value = false
    ElMessage.success('活动状态已更新')
  } catch {
    confirmVisible.value = false
  }
}
/** 保存草稿后读取真实可执行状态，再确认启用 */
const saveAndEnable = async (): Promise<void> => {
  await save()
  if (editor.state.value === 'success' && editor.server.value?.availableOperations.includes('open'))
    ask('open')
}
</script>

<template>
  <section class="campaign-edit-page">
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
      ><ApiErrorDetails :error="editor.apiError.value" />
      <p v-if="editor.conflict.value">
        草稿已保留，活动已被其他操作更新。请刷新信息并核对后再保存。
      </p>
      <ElButton v-if="!isNew" @click="editor.load(campaignId, true).catch(() => undefined)"
        >刷新服务端信息</ElButton
      ></ElAlert
    >
    <ElAlert v-if="validationError" :title="validationError" type="warning" :closable="false" />
    <AdminPanel class="campaign-panel" title="活动基本信息"
      ><ElForm class="basic-form" label-position="top" @submit.prevent="save"
        ><ElFormItem label="活动名称"
          ><ElInput
            v-model="editor.draft.value.name"
            :disabled="!canEdit"
            maxlength="200" /></ElFormItem
        ><ElFormItem label="学习时长"
          ><ElSelect
            :model-value="editor.draft.value.durationDays"
            :disabled="!canEdit"
            @update:model-value="editor.setDuration"
            ><ElOption label="3天 · 需要3个场景" :value="3" /><ElOption
              label="5天 · 需要5个场景"
              :value="5" /></ElSelect></ElFormItem></ElForm
    ></AdminPanel>
    <AdminPanel
      class="campaign-panel"
      :title="`选择学习内容 · 已选${editor.draft.value.sceneIds.length} / 所需${editor.draft.value.durationDays}`"
      ><CampaignSceneSelector
        v-model="editor.draft.value.sceneIds"
        :disabled="!canEdit"
        :required-count="editor.draft.value.durationDays"
    /></AdminPanel>
    <div class="capacity-row">
      <span>限制人数</span
      ><CampaignCapacityToggle
        :key="`${campaignId}:${editor.server.value?.currentVersion?.id ?? 'new'}`"
        v-model="editor.draft.value.capacity"
        :minimum="Math.max(1, editor.server.value?.currentVersion?.grantedUserCount ?? 1)"
        :disabled="!canEdit || editor.state.value === 'submitting'"
      />
    </div>
    <ElForm v-if="capacityLimited" class="capacity-form" label-position="top"
      ><ElFormItem label="人数上限"
        ><ElInputNumber
          v-model="editor.draft.value.capacity"
          class="campaign-number-input"
          :controls="false"
          :disabled="!canEdit"
          :min="1"
          :precision="0" /></ElFormItem
    ></ElForm>
    <p class="count">
      累计开通人数：{{ editor.server.value?.currentVersion?.grantedUserCount ?? 0 }}人（只读）
    </p>
    <ElCollapse class="advanced"
      ><ElCollapseItem name="activation"
        ><template #title
          ><div class="advanced-summary">
            <strong
              >高级设置 ·
              {{
                editor.activationWindowCustomized.value ? '已自定义启动期限' : '已随学习时长带入'
              }}</strong
            >
            <p>
              启动期限：开通后{{
                editor.draft.value.activationWindowDays
              }}天内首次开始。可展开修改，或恢复默认。
            </p>
          </div></template
        >
        <ElForm label-position="top"
          ><ElFormItem label="开通后多久内需要首次开始"
            ><ElInputNumber
              :model-value="editor.draft.value.activationWindowDays"
              :disabled="!canEdit"
              :min="1"
              :precision="0"
              @update:model-value="
                (value: number | undefined) => value && editor.setActivationWindow(value)
              "
            /><ElButton :disabled="!canEdit" link @click="editor.resetActivationWindow"
              >恢复默认</ElButton
            ></ElFormItem
          ></ElForm
        ></ElCollapseItem
      ></ElCollapse
    >
    <template v-if="editor.server.value"
      ><p v-if="!canEdit" class="locked-note">
        首次开通后学习时长、场景、顺序和启动期限锁定。复制后编辑新草稿，已有用户继续按原规则学习。
      </p>
      <ElCollapse
        ><ElCollapseItem title="活动状态与版本详情" name="details"
          ><p>
            当前状态：{{ editor.server.value.status }} · 当前服务端版本 v{{
              editor.server.value.version
            }}
          </p>
          <p>{{ editor.server.value.currentVersion?.id || '尚未生成版本' }}</p>
          <div class="operations">
            <ElButton
              v-for="operation in availableOperations.filter(
                (item) => item !== 'open' && item !== 'copy'
              )"
              :key="operation"
              :disabled="editor.state.value === 'submitting'"
              @click="ask(operation)"
              >{{
                { pause: '暂停', resume: '恢复', end: '结束', archive: '归档' }[operation]
              }}</ElButton
            ><RouterLink :to="{ name: 'campaign-versions', params: { id: campaignId } }"
              >活动规则与容量</RouterLink
            >
          </div></ElCollapseItem
        ></ElCollapse
      ></template
    >
    <AppPageActions
      ><div class="campaign-actions">
        <template v-if="canEdit"
          ><ElButton
            :disabled="!editor.draft.value.name.trim()"
            :loading="editor.state.value === 'submitting'"
            @click="save"
            >保存草稿</ElButton
          ><ElButton
            type="primary"
            :disabled="!editor.draft.value.name.trim()"
            :loading="editor.state.value === 'submitting'"
            @click="saveAndEnable"
            >检查并启用</ElButton
          ><ElButton v-if="availableOperations.includes('copy')" @click="ask('copy')"
            >复制并编辑</ElButton
          ></template
        ><template v-else
          ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
            ><ElButton @click="navigate">返回列表</ElButton></RouterLink
          ><ElButton
            v-if="availableOperations.includes('copy')"
            type="primary"
            :disabled="editor.state.value === 'submitting'"
            @click="ask('copy')"
            >复制并编辑</ElButton
          ></template
        >
      </div></AppPageActions
    >
    <ConfirmDialog
      v-if="editor.server.value"
      v-model="confirmVisible"
      :before-status="editor.server.value.status"
      :after-status="nextStatus[pendingOperation] ?? ''"
      :impact-scope="
        pendingOperation === 'copy'
          ? '复制当前版本并创建草稿版本；已有用户仍按原规则学习'
          : '更改活动状态，不影响已有用户权益'
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
@use '@/features/campaigns/campaign-panels';

.campaign-edit-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .basic-form {
    display: grid;
    grid-template-columns: minmax(0, 714fr) minmax(0, 384fr);
    gap: 16px;

    :deep(.el-form-item) {
      margin-bottom: 0;
    }

    :deep(.el-select) {
      width: 100%;
    }
  }

  .capacity-row {
    display: grid;
    grid-template-columns: minmax(0, 700fr) minmax(200px, 438fr);
    align-items: center;
    gap: 16px;
    font-size: 14px;
    line-height: 22px;
  }

  .capacity-form :deep(.el-form-item) {
    margin-bottom: 0;
  }

  .count {
    margin: -8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }

  .advanced {
    border: 0;
    border-radius: 16px;
    overflow: hidden;
    background: var(--juya-color-primary-soft);

    :deep([class~='el-collapse-item__header']),
    :deep([class~='el-collapse-item__wrap']) {
      padding: 0 16px;
      background: transparent;
      border: 0;
    }

    :deep([class~='el-collapse-item__header']) {
      height: auto;
      min-height: 84px;
      color: var(--juya-color-primary);
      font-size: 14px;
    }
  }

  .advanced-summary {
    display: grid;
    gap: 8px;
    padding-block: 16px;
    line-height: 22px;

    strong {
      font-weight: 500;
    }

    p {
      margin: 0;
      color: var(--juya-color-text-primary);
      font-size: 14px;
    }
  }

  .locked-note {
    margin: 0;
    font-size: 13px;
    color: var(--juya-color-text-secondary);
  }

  .operations {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  @media (width <= 700px) {
    .basic-form {
      grid-template-columns: 1fr;
    }

    .capacity-row {
      grid-template-columns: minmax(0, 1fr) 150px;
    }
  }
}
</style>

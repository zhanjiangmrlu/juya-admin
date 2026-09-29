<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
    if (id !== 'new')
      void editor
        .load(id)
        .then(() => {
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
  <section class="campaign-edit-page">
    <div class="heading">
      <div>
        <span>A11</span>
        <h2>{{ isNew ? '新建限时活动' : `限时活动编辑 · ${campaignId}` }}</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
        ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
      >
    </div>
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
      ><p v-if="editor.conflict.value">
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
      ></ElAlert
    >
    <ElCard class="card" shadow="never"
      ><ElForm label-position="top" @submit.prevent="save"
        ><div class="grid">
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
          <ElFormItem label="启动窗口（天）" required
            ><ElInputNumber
              v-model="editor.draft.value.activationWindowDays"
              :disabled="!canEdit"
              :min="1"
          /></ElFormItem>
          <ElFormItem label="容量上限" required
            ><ElInputNumber v-model="editor.draft.value.capacity" :disabled="!canEdit" :min="1"
          /></ElFormItem>
        </div>
        <ElFormItem label="场景顺序（每行一个场景编号）"
          ><ElInput v-model="sceneText" :disabled="!canEdit" type="textarea" :rows="4"
        /></ElFormItem>
        <p v-if="!canEdit" class="hint">
          当前状态 {{ editor.server.value?.status }}。仅草稿活动可编辑；容量调整请前往版本与容量页。
        </p>
        <ElButton
          v-if="canEdit"
          :disabled="!editor.draft.value.name.trim()"
          :loading="editor.state.value === 'submitting'"
          native-type="submit"
          type="primary"
          >保存活动</ElButton
        >
      </ElForm></ElCard
    >
    <ElCard v-if="editor.server.value" class="card" shadow="never"
      ><template #header><h3>当前状态与操作</h3></template
      ><ElDescriptions :column="2" border
        ><ElDescriptionsItem label="当前状态">{{ editor.server.value.status }}</ElDescriptionsItem
        ><ElDescriptionsItem label="服务端版本"
          >v{{ editor.server.value.version }}</ElDescriptionsItem
        ><ElDescriptionsItem label="当前活动版本">{{
          editor.server.value.currentVersion?.id ?? '尚未生成'
        }}</ElDescriptionsItem
        ><ElDescriptionsItem label="已开通人数">{{
          editor.server.value.currentVersion?.grantedUserCount ?? 0
        }}</ElDescriptionsItem></ElDescriptions
      >
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
        ><RouterLink :to="{ name: 'campaign-versions', params: { id: campaignId } }"
          ><ElButton>查看版本与容量</ElButton></RouterLink
        >
      </div></ElCard
    >
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
.campaign-edit-page {
  min-width: 0;

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  h2,
  h3 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
  }

  h2 {
    font-size: 18px;
    overflow-wrap: anywhere;
  }

  h3 {
    font-size: 15px;
  }

  .card {
    margin-top: 14px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 14px;
  }

  .hint {
    color: var(--juya-color-text-secondary);
  }

  .operations {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  @media (width <= 700px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

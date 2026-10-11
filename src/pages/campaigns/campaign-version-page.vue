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
import { validateCapacityLimit } from '@/features/campaigns/campaign-model'
import { useCampaignEditor } from '@/features/campaigns/use-campaign-editor'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createApiClient } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

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
const content = createContentAdapter(useAdminApiClient())
const titles = ref<Record<string, string>>({})
const capacity = ref<number | null | undefined>()
const capacityLimited = computed(() => capacity.value !== null && capacity.value !== undefined)
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
        if (loaded && id === campaignId.value) {
          capacity.value = editor.server.value?.currentVersion?.capacity
          for (const sceneId of editor.server.value?.currentVersion?.sceneIds ?? []) {
            void content
              .getScene(sceneId)
              .then((scene) => {
                if (id === campaignId.value) titles.value[sceneId] = scene.title
              })
              .catch(() => undefined)
          }
        }
      })
      .catch(() => undefined)
  },
  { immediate: true }
)
const /**
   * 提交已确认的容量命令。
   * @returns 容量命令完成后的 Promise
   */
  confirm = async (): Promise<void> => {
    if (capacity.value === undefined || !capacityValidation.value?.valid) return
    try {
      await editor.command('capacity', capacity.value)
      confirmVisible.value = false
      ElMessage.success('容量已更新')
    } catch {
      confirmVisible.value = false
    }
  }
const /** 复制真实活动版本后进入可编辑草稿 */
  copy = async (): Promise<void> => {
    try {
      await editor.copy()
      await router.push({ name: 'campaign-edit', params: { id: campaignId.value } })
    } catch {
      /* 保留真实错误 */
    }
  }
</script>

<template>
  <section class="campaign-version-page">
    <ElSkeleton
      v-if="editor.state.value === 'loading'"
      :rows="6"
      animated
      aria-label="正在加载活动版本"
    />
    <ElAlert v-if="editor.error.value" :title="editor.error.value" type="error" :closable="false"
      ><ApiErrorDetails :error="editor.apiError.value" />
      <p v-if="editor.conflict.value">原容量输入已保留，请刷新信息并核对后重试。</p>
      <ElButton @click="editor.load(campaignId, true).catch(() => undefined)"
        >刷新服务端信息</ElButton
      ></ElAlert
    >
    <AdminPanel class="campaign-panel rules-card"
      ><div class="rules-summary">
        <h3>{{ editor.server.value?.name || '活动规则' }}</h3>
        <ElTag class="campaign-status" :class="{ muted: editor.server.value?.status !== 'OPEN' }">{{
          { OPEN: '可开通', DRAFT: '草稿', PAUSED: '暂停', ENDED: '结束', ARCHIVED: '归档' }[
            editor.server.value?.status || ''
          ] || editor.server.value?.status
        }}</ElTag>
        <ElEmpty v-if="!current" description="活动尚无当前版本" /><template v-else
          ><p>
            学习时长：{{ current.durationDays }}天 · 启动期限：开通后{{
              current.activationWindowDays
            }}天内首次开始
          </p>
          <strong class="scene-order">{{
            current.sceneIds.map((id) => titles[id] || '内容标题暂未读取').join(' → ')
          }}</strong>
          <p class="help">
            {{
              current.lockedAt || current.grantedUserCount > 0
                ? '已首次开通，学习时长、场景、顺序和启动期限已锁定。复制后可编辑新草稿，已有用户继续按原规则学习。'
                : '尚未首次开通，核心规则未锁定。草稿中可编辑学习时长、场景、顺序和启动期限。'
            }}
          </p>
        </template>
      </div></AdminPanel
    >
    <AdminPanel class="campaign-panel capacity-card"
      ><div class="capacity-content">
        <h3>人数限制</h3>
        <div class="capacity-summary">
          <strong>累计开通人数：{{ current?.grantedUserCount ?? '—' }}人（只读）</strong
          ><CampaignCapacityToggle
            :key="`${campaignId}:${current?.id ?? 'loading'}`"
            v-model="capacity"
            :minimum="Math.max(1, current?.grantedUserCount ?? 1)"
            :disabled="!current || !canChangeCapacity || editor.state.value === 'submitting'"
          />
        </div>
        <ElForm label-position="top"
          ><ElFormItem v-if="capacityLimited" label="人数上限"
            ><ElInputNumber
              :key="String(canChangeCapacity)"
              v-model="capacity"
              class="campaign-number-input"
              :controls="false"
              :disabled="!current || !canChangeCapacity"
              :min="1"
              :precision="0" /></ElFormItem></ElForm
        ><ElAlert
          v-if="capacityValidation && !capacityValidation.valid"
          :title="capacityValidation.message"
          type="error"
          :closable="false"
        />
        <p class="help">
          上限不能低于累计{{
            current?.grantedUserCount ?? '—'
          }}人。关闭限制后恢复不限人数，既有权益不受影响；到期、暂停、撤销均不释放累计名额。
        </p>
      </div></AdminPanel
    >
    <AppPageActions
      ><div class="campaign-actions">
        <ElButton
          :disabled="
            !current ||
            !canChangeCapacity ||
            !capacityValidation?.valid ||
            editor.state.value === 'submitting'
          "
          @click="confirmVisible = true"
          >保存容量</ElButton
        ><ElButton
          type="primary"
          :disabled="!editor.server.value?.availableOperations.includes('copy')"
          :loading="editor.state.value === 'submitting'"
          @click="copy"
          >复制并编辑</ElButton
        >
      </div></AppPageActions
    >
    <ConfirmDialog
      v-if="editor.server.value && current"
      v-model="confirmVisible"
      title="确认容量调整"
      :object-id="current.id"
      :before-status="String(current.capacity ?? '不限人数')"
      :after-status="String(capacity ?? '不限人数')"
      impact-scope="调整新开通人数上限，已有用户权益不受影响"
      :reason-required="false"
      :submitting="editor.state.value === 'submitting'"
      @confirm="confirm"
    />
  </section>
</template>
<style scoped lang="scss">
@use '@/features/campaigns/campaign-panels';

.campaign-version-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .rules-summary,
  .capacity-content {
    display: grid;
    gap: 16px;
  }

  :deep(.campaign-panel [class~='el-card__body']) {
    padding: 24px;
  }

  .campaign-status {
    width: 120px;
    height: 28px;
    border: 0;
    border-radius: 10px;
    background: var(--juya-color-primary-soft);
    color: var(--juya-color-primary);
    font-size: 11px;

    &.muted {
      background: var(--juya-color-page);
      color: var(--juya-color-text-secondary);
    }
  }

  .capacity-summary {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  h3 {
    margin: 0;
    font-size: 18px;
    line-height: 29px;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 22px;
  }

  .scene-order {
    display: block;
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 18px;
    font-weight: 500;
    line-height: 27px;
  }

  .help {
    color: var(--juya-color-text-secondary);
  }

  .capacity-summary {
    display: grid;
    grid-template-columns: minmax(0, 760fr) minmax(200px, 330fr);
    font-size: 17px;
    line-height: 25px;
  }

  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  @media (width <= 700px) {
    .capacity-summary {
      grid-template-columns: 1fr;
    }

    :deep(.campaign-panel [class~='el-card__body']) {
      padding: 20px;
    }
  }
}
</style>

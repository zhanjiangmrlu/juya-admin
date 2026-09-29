<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
      .then(() => {
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
  <section class="campaign-version-page">
    <div class="heading">
      <div>
        <span>A12</span>
        <h2>活动版本与容量 · {{ campaignId }}</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
        ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
      >
    </div>
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
      ><p v-if="editor.conflict.value">
        原容量输入已保留。服务端最新版本：{{
          editor.conflictVersion.value === null
            ? '暂未获取，请刷新'
            : `v${editor.conflictVersion.value}`
        }}，请核对后重试。
      </p>
      <ElButton size="small" @click="editor.load(campaignId, true).catch(() => undefined)"
        >刷新服务端信息</ElButton
      ></ElAlert
    >
    <div class="grid">
      <ElCard shadow="never"
        ><template #header><h3>当前版本</h3></template
        ><ElEmpty v-if="!current" description="活动尚无当前版本" /><ElDescriptions
          v-else
          :column="1"
          border
          ><ElDescriptionsItem label="版本编号">{{ current.id }}</ElDescriptionsItem
          ><ElDescriptionsItem label="版本序号">{{ current.versionNo }}</ElDescriptionsItem
          ><ElDescriptionsItem label="状态">{{ current.status }}</ElDescriptionsItem
          ><ElDescriptionsItem label="学习时长">{{ current.durationDays }} 天</ElDescriptionsItem
          ><ElDescriptionsItem label="启动窗口"
            >{{ current.activationWindowDays }} 天</ElDescriptionsItem
          ><ElDescriptionsItem label="开通时间"
            >{{ current.grantStartsAt ?? '—' }} 至
            {{ current.grantEndsAt ?? '—' }}</ElDescriptionsItem
          ><ElDescriptionsItem label="场景顺序"
            ><span class="wrap">{{
              current.sceneIds.join('、') || '未配置'
            }}</span></ElDescriptionsItem
          ></ElDescriptions
        ></ElCard
      >
      <ElCard shadow="never"
        ><template #header><h3>容量调整</h3></template
        ><ElAlert
          title="容量不能低于服务端已开通人数"
          type="info"
          :closable="false"
          show-icon
        /><ElDescriptions v-if="current" :column="1" border class="summary"
          ><ElDescriptionsItem label="当前容量">{{ current.capacity }}</ElDescriptionsItem
          ><ElDescriptionsItem label="已开通人数">{{ current.grantedUserCount }}</ElDescriptionsItem
          ><ElDescriptionsItem label="服务端版本"
            >v{{ editor.server.value?.version }}</ElDescriptionsItem
          ></ElDescriptions
        ><ElFormItem label="新容量" class="capacity"
          ><ElInputNumber
            :key="String(canChangeCapacity)"
            v-model="capacity"
            :disabled="!current || !canChangeCapacity"
            :min="1" /></ElFormItem
        ><ElAlert
          v-if="capacityValidation && !capacityValidation.valid"
          :title="capacityValidation.message"
          type="error"
          :closable="false"
        /><ElButton
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
        ></ElCard
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
.campaign-version-page {
  min-width: 0;

  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
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
    overflow-wrap: anywhere;
  }

  h2 {
    font-size: 18px;
  }

  h3 {
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(340px, 2fr);
    gap: 14px;
  }

  .grid > * {
    min-width: 0;
  }

  .summary {
    margin-top: 18px;
  }

  .capacity {
    margin-top: 18px;
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
</style>

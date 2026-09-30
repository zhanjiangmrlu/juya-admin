<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import AuditEventList from '@/components/audit-event-list/audit-event-list.vue'
import { createAuditAdapter } from '@/features/audit/audit-adapter'
import { createSystemConfigAdapter } from '@/features/system-config/system-config-adapter'
import { useSystemConfig } from '@/features/system-config/use-system-config'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AuditEvent } from '@/features/audit/audit-adapter'
import type { SystemConfigDraft } from '@/features/system-config/system-config-model'

const client = useAdminApiClient()
const controller = useSystemConfig(createSystemConfigAdapter(client))
const auditAdapter = createAuditAdapter(client)
const auditEvents = ref<AuditEvent[]>([])
const form = reactive<SystemConfigDraft>({
  expiryWarningDays: 7,
  feedbackSlaHours: 24,
  readonlyPreviewEnabled: false,
  shadowingEnabled: false,
  unentitledMaterialEntryEnabled: false
})

onMounted(() => void loadPage())

/**
 * 加载配置和最近审计事件
 *
 * @returns 页面加载完成后的 Promise
 */
async function loadPage(): Promise<void> {
  try {
    await controller.load()
    if (controller.draft.value) Object.assign(form, controller.draft.value)
    auditEvents.value = await auditAdapter.list()
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '系统配置加载失败')
  }
}

/**
 * 保存系统配置并展示结果
 *
 * @returns 保存完成后的 Promise
 */
async function saveConfig(): Promise<void> {
  try {
    await controller.save({ ...form })
    ElMessage.success('系统配置已保存')
  } catch {
    // 控制器负责展示冲突和错误
  }
}
</script>

<template>
  <section class="settings-page">
    <div class="page-heading">
      <div>
        <span>A26</span>
        <h2>系统配置</h2>
      </div>
    </div>
    <div class="settings-grid">
      <ElCard shadow="never"
        ><template #header><h3>SLA 与到期阈值</h3></template
        ><ElForm label-position="top" @submit.prevent="saveConfig"
          ><ElFormItem label="反馈处理 SLA（小时）" required
            ><ElInputNumber v-model="form.feedbackSlaHours" :min="1" :max="168" /></ElFormItem
          ><ElFormItem label="权益即将到期阈值（天）" required
            ><ElInputNumber v-model="form.expiryWarningDays" :min="1" :max="90" /></ElFormItem
          ><ElDivider />
          <h3>审核敏感开关</h3>
          <div class="switch-row">
            <span>跟读录音</span><ElSwitch v-model="form.shadowingEnabled" />
          </div>
          <div class="switch-row">
            <span>只读预览</span><ElSwitch v-model="form.readonlyPreviewEnabled" />
          </div>
          <div class="switch-row">
            <span>未开通页面资料次级入口</span
            ><ElSwitch v-model="form.unentitledMaterialEntryEnabled" />
          </div>
          <ElAlert
            class="impact-alert"
            :closable="false"
            title="保存将影响反馈时限、运营提醒及用户端敏感功能展示"
            type="warning"
            show-icon
          /><ElButton native-type="submit" type="primary">保存配置</ElButton></ElForm
        ></ElCard
      >
      <ElCard shadow="never"
        ><template #header><h3>配置说明</h3></template
        ><ElDescriptions :column="1" border
          ><ElDescriptionsItem label="并发控制">每个配置键携带读取时版本</ElDescriptionsItem
          ><ElDescriptionsItem label="冲突处理">重新加载远端版本且保留本地草稿</ElDescriptionsItem
          ><ElDescriptionsItem label="审计"
            >配置更新由服务端写入审计事件</ElDescriptionsItem
          ></ElDescriptions
        ></ElCard
      >
    </div>
    <ElAlert
      v-if="controller.error.value"
      class="page-alert"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <ElCard class="audit-card" shadow="never"
      ><template #header><h3>最近审计事件</h3></template><AuditEventList :items="auditEvents"
    /></ElCard>
    <ElDialog
      :model-value="Boolean(controller.conflict.value)"
      title="配置版本冲突"
      width="680px"
      :close-on-click-modal="false"
      @close="controller.dismissConflict"
      ><p>远端配置已更新，本地草稿未被覆盖，请对比后重新提交</p>
      <div v-if="controller.conflict.value" class="conflict-grid">
        <div>
          <strong>本地草稿</strong>
          <pre>{{ JSON.stringify(form, null, 2) }}</pre>
        </div>
        <div>
          <strong>远端版本 v{{ controller.conflict.value.remoteVersion }}</strong>
          <pre>{{ JSON.stringify(controller.conflict.value.remoteDraft, null, 2) }}</pre>
        </div>
      </div></ElDialog
    >
  </section>
</template>

<style scoped lang="scss">
.settings-page {
  .page-heading {
    margin-bottom: 14px;

    span {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(420px, 3fr) minmax(300px, 2fr);
    gap: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--juya-color-border-light);
  }

  .impact-alert,
  .page-alert,
  .audit-card {
    margin-top: 14px;
  }

  .conflict-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;

    pre {
      overflow: auto;
      padding: 12px;
      border-radius: 6px;
      background: var(--juya-color-page);
      font-size: 11px;
    }
  }

  @media (width <= 1050px) {
    .settings-grid,
    .conflict-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

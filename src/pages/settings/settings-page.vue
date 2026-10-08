<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import AuditEventList from '@/components/audit-event-list/audit-event-list.vue'
import { createAuditAdapter } from '@/features/audit/audit-adapter'
import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import { createSystemConfigAdapter } from '@/features/system-config/system-config-adapter'
import { useSystemConfig } from '@/features/system-config/use-system-config'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AuditEvent } from '@/features/audit/audit-adapter'
import type { OcrQuota } from '@/features/ocr/ocr-adapter'
import type { SystemConfigDraft } from '@/features/system-config/system-config-model'

const client = useAdminApiClient()
const controller = useSystemConfig(createSystemConfigAdapter(client))
const auditAdapter = createAuditAdapter(client)
const ocrAdapter = createOcrAdapter(client)
const ocrQuota = ref<OcrQuota | null>(null)
const ocrQuotaError = ref('')

/**
 * 读取 OCR 现行开关与安全额度，不触发识别或修改费用配置
 *
 * @returns 额度读取完成后的 Promise
 */
async function loadOcrQuota(): Promise<void> {
  ocrQuotaError.value = ''
  try {
    ocrQuota.value = await ocrAdapter.getQuota()
  } catch {
    ocrQuota.value = null
    ocrQuotaError.value = 'OCR 配置读取失败，请重试'
  }
}
const auditEvents = ref<AuditEvent[]>([])
const form = reactive<SystemConfigDraft>({
  expiryWarningDays: 7,
  feedbackSlaHours: 24,
  readonlyPreviewEnabled: false,
  shadowingEnabled: false,
  unentitledMaterialEntryEnabled: false
})

onMounted(() => {
  void loadPage()
  void loadOcrQuota()
})

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
    <div class="settings-grid">
      <ElCard class="config-card" shadow="never">
        <template #header
          ><h2>系统与审核配置</h2>
          <p>管理员权限下修改，所有变更写入审计</p></template
        >
        <ElForm
          :key="controller.isReady.value ? 'loaded' : 'loading'"
          label-position="top"
          :disabled="
            controller.isLoading.value || !controller.isReady.value || controller.isSaving.value
          "
          @submit.prevent="saveConfig"
        >
          <ElFormItem label="只读预览总开关"
            ><div class="switch-field">
              <span>{{ form.readonlyPreviewEnabled ? '开启' : '关闭' }}</span
              ><ElSwitch v-model="form.readonlyPreviewEnabled" aria-label="只读预览" /></div
          ></ElFormItem>
          <ElFormItem label="完善账号资料入口"
            ><div class="switch-field">
              <span>{{ form.unentitledMaterialEntryEnabled ? '开启 · 可独立关闭' : '关闭' }}</span
              ><ElSwitch
                v-model="form.unentitledMaterialEntryEnabled"
                aria-label="未开通页面资料次级入口"
              /></div
          ></ElFormItem>
          <ElFormItem label="反馈处理 SLA（小时）" required
            ><ElInputNumber
              v-model="form.feedbackSlaHours"
              :min="1"
              :max="168"
              aria-label="反馈处理 SLA（小时）"
          /></ElFormItem>
          <ElFormItem label="权益即将到期阈值（天）" required
            ><ElInputNumber
              v-model="form.expiryWarningDays"
              :min="1"
              :max="90"
              aria-label="权益即将到期阈值（天）"
          /></ElFormItem>
          <ElFormItem label="OCR 功能开关"
            ><div class="readonly-field">
              {{
                ocrQuota
                  ? (ocrQuota.enabled ? '开启' : '关闭') +
                    (ocrQuota.paid_disabled ? '（付费调用已禁用）' : '（按服务端费用配置）')
                  : '正在读取现行配置'
              }}
            </div></ElFormItem
          >
          <ElFormItem label="OCR 月度内部安全上限"
            ><div class="readonly-field">
              {{
                ocrQuota
                  ? ocrQuota.monthly_limit + ' 次 · 剩余 ' + ocrQuota.remaining + ' 次'
                  : '正在读取现行额度'
              }}
            </div></ElFormItem
          >
          <ElFormItem label="跟读录音"
            ><div class="switch-field">
              <span>{{ form.shadowingEnabled ? '开启' : '关闭' }}</span
              ><ElSwitch v-model="form.shadowingEnabled" aria-label="跟读录音" /></div
          ></ElFormItem>
          <RouterLink class="ocr-entry" to="/content/import">管理 OCR 开关与额度</RouterLink>
        </ElForm>
        <ElAlert v-if="ocrQuotaError" :title="ocrQuotaError" :closable="false" type="error"
          ><ElButton size="small" @click="loadOcrQuota">重试读取 OCR 配置</ElButton></ElAlert
        >
      </ElCard>
      <div class="review-column">
        <ElCard class="review-card" shadow="never"
          ><template #header><h2>发布前复核</h2></template>
          <ul class="review-list">
            <li><strong>小程序类目</strong><span>以当前 AppID 审核结果为准</span></li>
            <li><strong>OCR 费用</strong><span>百度控制台额度与付费状态需核实</span></li>
            <li><strong>联系资料</strong><span>仅管理员可查看完整微信号</span></li>
            <li><strong>受限素材</strong><span>接口逐次校验权益</span></li>
          </ul>
        </ElCard>
        <aside class="confirmation-note">
          <strong>提交前确认</strong>
          <p>审核边界、额度与时效规则可能变化；上线前重新核实。</p>
          <p>保存将影响反馈时限、运营提醒及用户端敏感功能展示。</p>
        </aside>
        <div class="save-actions">
          <ElButton
            aria-label="保存配置"
            type="primary"
            :loading="controller.isSaving.value"
            :disabled="controller.isLoading.value || !controller.isReady.value"
            @click="saveConfig"
            >保存系统配置</ElButton
          >
        </div>
      </div>
    </div>
    <ElAlert
      v-if="controller.error.value"
      class="page-alert"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
      ><ElButton
        v-if="!controller.isReady.value"
        :loading="controller.isLoading.value"
        @click="loadPage"
        >重新读取配置</ElButton
      ></ElAlert
    >
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
  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
    padding-top: 5px;
  }

  .config-card {
    min-height: 630px;
    background: #eaf2e3;
  }

  h2,
  h3 {
    margin: 0;
    font-size: 20px;
  }

  .config-card p {
    margin: 8px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }
  /* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
  .config-card :deep(.el-card__body) {
    padding-top: 0;
  }

  .config-card :deep(.el-form-item) {
    margin-bottom: 17px;
  }

  .config-card :deep(.el-form-item__label) {
    margin-bottom: 5px;
    line-height: 22px;
  }

  .config-card :deep(.el-input-number) {
    width: 100%;
  }

  .config-card :deep(.el-input__inner) {
    text-align: left;
  }
  /* stylelint-enable selector-class-pattern */
  .switch-field,
  .readonly-field {
    display: flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    border: 1px solid var(--juya-color-border);
    border-radius: 10px;
    background: var(--juya-color-sidebar-surface);
    color: var(--juya-color-text-primary);
  }

  .ocr-entry {
    color: var(--juya-color-primary);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .review-card {
    min-height: 455px;
  }

  .review-list {
    display: grid;
    gap: 28px;
    margin: 20px 0;
    padding: 0;
    list-style: none;
  }

  .review-list li {
    position: relative;
    display: grid;
    gap: 5px;
    padding-left: 18px;
  }

  .review-list li::before {
    position: absolute;
    top: 3px;
    left: 0;
    width: 5px;
    height: 36px;
    border-radius: 3px;
    background: var(--juya-color-success);
    content: '';
  }

  .review-list strong {
    font-size: 13px;
  }

  .review-list span {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .confirmation-note {
    min-height: 156px;
    margin-top: 19px;
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--juya-color-primary-soft);
  }

  .confirmation-note strong {
    color: var(--juya-color-brand-accent);
    font-size: 14px;
  }

  .confirmation-note p {
    margin: 20px 0 0;
    font-size: 13px;
  }

  .save-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 28px;
  }

  .save-actions .el-button {
    min-width: 196px;
    height: 44px;
  }

  .page-alert,
  .audit-card {
    margin-top: 24px;
  }

  .conflict-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .conflict-grid pre {
    overflow: auto;
    padding: 12px;
    border-radius: 10px;
    background: var(--juya-color-page);
    font-size: 11px;
  }

  @media (width <= 1050px) {
    .settings-grid,
    .conflict-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

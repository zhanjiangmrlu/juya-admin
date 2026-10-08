<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import TaskProgress from '@/components/task-progress/task-progress.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { validateImageBatch } from '@/features/content-import/import-validation'
import { createUploadAdapter } from '@/features/content-import/upload-adapter'
import { useUploadQueue } from '@/features/content-import/use-upload-queue'
import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import { isOcrQuotaVerifiedThisMonth } from '@/features/ocr/ocr-model'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { useIdempotentCommand } from '@/shared/commands/idempotent-command'

import type { ContentSeries } from '@/features/content/content-adapter'
import type { UploadQueueItem } from '@/features/content-import/use-upload-queue'
import type { UploadFile, UploadFiles } from 'element-plus'

const context = reactive({ seriesId: '', templateId: '' })
const queue = useUploadQueue(createUploadAdapter(useAdminApiClient()))
const contextLocked = computed(() => queue.items.value.length > 0)
const router = useRouter()
const adapter = createContentAdapter(useAdminApiClient())
const ocr = createOcrAdapter(useAdminApiClient())
const ocrSettingsCommand = useIdempotentCommand(ocr.updateSettings)
const savingOcr = ref(false)
const loadingOcr = ref(false)
const ocrSettingsReady = ref(false)
const ocrSettingsError = ref('')
const series = ref<ContentSeries[]>([])
const ocrSettings = reactive({
  enabled: false,
  monthly_limit: 0,
  free_quota: 0,
  paid_disabled: true,
  verify_quota: false
})
const quotaText = ref('')
const /** 加载系列、OCR 额度及本月核验状态 */
  loadContext = async (): Promise<void> => {
    loadingOcr.value = true
    ocrSettingsReady.value = false
    ocrSettingsError.value = ''
    try {
      series.value = await adapter.listSeries()
      const quota = await ocr.getQuota()
      Object.assign(ocrSettings, quota)
      ocrSettings.verify_quota = isOcrQuotaVerifiedThisMonth(quota.quota_verified_at, quota.month)
      quotaText.value = `${quota.month} 已使用 ${quota.reserved_count}，剩余 ${quota.remaining}，控制台核验 ${quota.quota_verified_at || '尚未完成'}`
      ocrSettingsReady.value = true
    } catch (failure) {
      ocrSettingsError.value = failure instanceof Error ? failure.message : '配置加载失败'
      ElMessage.error(ocrSettingsError.value)
    } finally {
      loadingOcr.value = false
    }
  }
const /** 保存 OCR 配置和管理员控制台核验记录并恢复服务端状态 */
  saveOcr = async (): Promise<void> => {
    if (savingOcr.value || !ocrSettingsReady.value) return
    savingOcr.value = true
    try {
      await ocrSettingsCommand.submit({
        enabled: ocrSettings.enabled,
        monthly_limit: ocrSettings.monthly_limit,
        free_quota: ocrSettings.free_quota,
        paid_disabled: ocrSettings.paid_disabled,
        verify_quota: ocrSettings.verify_quota
      })
      ocrSettingsCommand.reset()
      await loadContext()
      ElMessage.success('OCR 设置已保存')
    } catch (failure) {
      ElMessage.error(failure instanceof Error ? failure.message : 'OCR 设置保存失败')
    } finally {
      savingOcr.value = false
    }
  }
/** 编辑上传确认后自动建立的场景草稿。
 * @param item - 上传素材
 */
async function editImage(item: Readonly<UploadQueueItem>): Promise<void> {
  if (item.sceneId) await router.push({ name: 'content-scene-edit', params: { id: item.sceneId } })
}
onMounted(loadContext)

/**
 * 接收 Element Plus 选择的本地图片
 *
 * @param _file - 本次变化的上传文件
 * @param files - 当前选择的全部上传文件
 * @returns 无返回值
 */
function handleFiles(_file: UploadFile, files: UploadFiles): void {
  const batch = files.flatMap((candidate) =>
    candidate.raw
      ? [{ file: candidate.raw, seriesId: context.seriesId, templateId: context.templateId }]
      : []
  )
  const validation = validateImageBatch(batch)
  if (!validation.valid) {
    ElMessage.warning(validation.message)
    return
  }
  for (const item of batch) {
    if (!queue.items.value.some((queued) => queued.file.name === item.file.name))
      queue.add(item.file, { seriesId: item.seriesId, templateId: item.templateId })
  }
}
</script>

<template>
  <section class="content-import-page admin-brand-headings">
    <div class="page-heading">
      <div>
        <p class="page-description">
          批量图片上传建立场景草稿；同一系列和模板下的相同图片复用已有场景，不自动调用 OCR。
        </p>
      </div>
    </div>
    <div class="content-grid">
      <AdminPanel :title="ADMIN_SECTION_TITLES.contentImport.uploadBatch">
        <ElAlert
          :closable="false"
          title="单批最多 30 张，且必须属于同一系列和模板"
          type="info"
          show-icon
        />
        <ElForm class="batch-form" label-position="top">
          <ElFormItem label="系列编号" required
            ><ElSelect v-model="context.seriesId" :disabled="contextLocked"
              ><ElOption
                v-for="item in series"
                :key="item.id"
                :label="item.title"
                :value="item.id" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="识别模板" required
            ><ElSelect v-model="context.templateId" :disabled="contextLocked"
              ><ElOption label="对话" value="dialogue" /><ElOption
                label="词汇"
                value="vocabulary" /></ElSelect
          ></ElFormItem>
        </ElForm>
        <ElUpload
          :auto-upload="false"
          :disabled="!context.seriesId || !context.templateId"
          :limit="30"
          accept="image/jpeg,image/png,image/webp"
          drag
          multiple
          @change="handleFiles"
        >
          <div class="upload-copy">
            <strong>拖拽图片到这里</strong><span>或点击选择 JPG、PNG、WebP 文件</span>
          </div>
        </ElUpload>
        <ElButton
          class="start-button"
          :disabled="queue.items.value.length === 0"
          type="primary"
          @click="queue.startAll"
          >开始上传</ElButton
        >
      </AdminPanel>

      <AdminPanel :title="ADMIN_SECTION_TITLES.contentImport.taskQueue">
        <ElEmpty v-if="queue.items.value.length === 0" description="尚未选择图片" />
        <template v-else>
          <div v-for="item in queue.items.value" :key="item.id" class="queue-item">
            <TaskProgress :item="item" @cancel="queue.cancel" @retry="queue.start" />
            <ElButton v-if="item.sceneId" link type="primary" @click="editImage(item)"
              >编辑场景草稿</ElButton
            >
          </div>
        </template>
        <ElAlert
          class="ocr-note"
          :closable="false"
          title="上传只确认素材。进入场景后可手工录入或显式启动 OCR，并逐项采纳候选。"
          type="success"
          show-icon
        />
      </AdminPanel>
    </div>
    <AdminPanel :title="ADMIN_SECTION_TITLES.contentImport.ocrNote" class="ocr-note">
      <p>{{ quotaText }}</p>
      <p>内部月额度为 0 时不会发起识别，不代表不限量。</p>
      <ElAlert v-if="ocrSettingsError" :title="ocrSettingsError" :closable="false" type="error" />
      <ElButton
        v-if="ocrSettingsError"
        :loading="loadingOcr"
        :disabled="savingOcr"
        @click="loadContext"
        >重新读取 OCR 设置</ElButton
      >
      <!-- ElInputNumber 仅在挂载时写 aria-disabled，锁定变化时重建以保持状态一致。 -->
      <ElForm
        :key="savingOcr || !ocrSettingsReady ? 'locked' : 'ready'"
        inline
        :disabled="savingOcr || !ocrSettingsReady"
        ><ElFormItem label="启用 OCR"><ElSwitch v-model="ocrSettings.enabled" /></ElFormItem
        ><ElFormItem label="内部月额度"
          ><ElInputNumber v-model="ocrSettings.monthly_limit" :min="0" :precision="0" /></ElFormItem
        ><ElFormItem label="控制台免费额度"
          ><ElInputNumber v-model="ocrSettings.free_quota" :min="0" :precision="0" /></ElFormItem
        ><ElFormItem
          ><ElCheckbox v-model="ocrSettings.paid_disabled">已关闭付费调用</ElCheckbox></ElFormItem
        ><ElFormItem
          ><ElCheckbox v-model="ocrSettings.verify_quota"
            >已在百度控制台核验本月额度</ElCheckbox
          ></ElFormItem
        ><ElButton :loading="savingOcr" :disabled="savingOcr || !ocrSettingsReady" @click="saveOcr"
          >保存 OCR 设置</ElButton
        ></ElForm
      ></AdminPanel
    >
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.content-import-page {
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

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
  }

  .batch-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 16px;
  }

  .upload-copy {
    display: grid;
    gap: 6px;
    color: var(--juya-color-text-secondary);
  }

  .start-button {
    width: 100%;
    margin-top: 16px;
  }

  .ocr-note {
    margin-top: 16px;
  }

  .queue-item {
    display: grid;
    gap: 6px;

    a {
      color: var(--el-color-primary);
      font-size: 12px;
      text-align: right;
    }
  }

  @media (width <= 1100px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }
}

.content-import-page :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.content-grid > :deep(.el-card:first-child) {
  background: #eaf2e3;
}

.page-description {
  margin: 0;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}
</style>

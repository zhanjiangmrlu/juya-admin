<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import TaskProgress from '@/components/task-progress/task-progress.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { validateImageBatch } from '@/features/content-import/import-validation'
import { createUploadAdapter } from '@/features/content-import/upload-adapter'
import { useUploadQueue } from '@/features/content-import/use-upload-queue'
import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
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
const series = ref<ContentSeries[]>([])
const ocrSettings = reactive({
  enabled: false,
  monthly_limit: 0,
  free_quota: 0,
  paid_disabled: true,
  verify_quota: false
})
const quotaText = ref('')
/** 加载系列和服务器 OCR 额度。 */
async function loadContext(): Promise<void> {
  try {
    series.value = await adapter.listSeries()
    const quota = await ocr.getQuota()
    Object.assign(ocrSettings, quota)
    quotaText.value = `${quota.month} 已使用 ${quota.reserved_count}，剩余 ${quota.remaining}，控制台核验 ${quota.quota_verified_at || '尚未完成'}`
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '配置加载失败')
  }
}
/** 保存 OCR 配置和管理员控制台核验记录。 */
async function saveOcr(): Promise<void> {
  if (savingOcr.value) return
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
    ocrSettings.verify_quota = false
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
  <section class="content-import-page">
    <div class="page-heading">
      <div>
        <span>A18</span>
        <h2>批量图片上传</h2>
      </div>
    </div>
    <div class="content-grid">
      <ElCard shadow="never">
        <template #header><h3>上传批次</h3></template>
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
      </ElCard>

      <ElCard shadow="never">
        <template #header><h3>任务队列</h3></template>
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
      </ElCard>
    </div>
    <ElCard class="ocr-note" shadow="never"
      ><template #header><h3>OCR 安全额度设置</h3></template>
      <p>{{ quotaText }}</p>
      <p>内部月额度为 0 时不会发起识别，不代表不限量。</p>
      <ElForm inline :disabled="savingOcr"
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
        ><ElButton :loading="savingOcr" :disabled="savingOcr" @click="saveOcr"
          >保存 OCR 设置</ElButton
        ></ElForm
      ></ElCard
    >
  </section>
</template>

<style scoped lang="scss">
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
    grid-template-columns: minmax(360px, 2fr) minmax(420px, 3fr);
    gap: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
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
</style>

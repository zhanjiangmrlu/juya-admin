<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive } from 'vue'

import TaskProgress from '@/components/task-progress/task-progress.vue'
import { validateImageBatch } from '@/features/content-import/import-validation'
import { createUploadAdapter } from '@/features/content-import/upload-adapter'
import { useUploadQueue } from '@/features/content-import/use-upload-queue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { UploadFile, UploadFiles } from 'element-plus'

const context = reactive({ seriesId: '', templateId: '' })
const queue = useUploadQueue(createUploadAdapter(useAdminApiClient()))
const contextLocked = computed(() => queue.items.value.length > 0)

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
        <h2>批量上传与 OCR</h2>
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
            ><ElInput v-model="context.seriesId" :disabled="contextLocked" maxlength="64"
          /></ElFormItem>
          <ElFormItem label="识别模板" required
            ><ElInput v-model="context.templateId" :disabled="contextLocked" maxlength="64"
          /></ElFormItem>
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
            <RouterLink
              v-if="item.jobId"
              :to="{
                name: 'content-ocr',
                params: { itemId: item.assetId ?? 'asset', taskId: item.jobId }
              }"
              >进入 OCR 校对</RouterLink
            >
          </div>
        </template>
        <ElAlert
          class="ocr-note"
          :closable="false"
          title="上传确认后自动创建持久化 OCR 任务，可取消、重试并进入人工校对"
          type="success"
          show-icon
        />
      </ElCard>
    </div>
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

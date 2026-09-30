<script setup lang="ts">
import type { UploadQueueItem } from '@/features/content-import/use-upload-queue'

defineProps<{ item: Readonly<UploadQueueItem> }>()
defineEmits<{ cancel: [id: string]; retry: [id: string] }>()

const labels = {
  'awaiting-ocr': '上传已确认，等待 OCR 处理',
  cancelled: '已取消',
  failed: '上传失败',
  preparing: '计算摘要并申请上传策略',
  queued: '等待上传',
  uploading: '正在上传'
} as const
</script>

<template>
  <div class="task-progress">
    <div class="task-copy">
      <strong>{{ item.file.name }}</strong
      ><span>{{ labels[item.status] }}</span>
    </div>
    <ElProgress
      :percentage="item.progress"
      :status="item.status === 'failed' ? 'exception' : undefined"
    />
    <div class="task-actions">
      <ElButton v-if="item.status === 'failed'" size="small" @click="$emit('retry', item.id)"
        >重试</ElButton
      >
      <ElButton
        v-if="['preparing', 'uploading'].includes(item.status)"
        size="small"
        @click="$emit('cancel', item.id)"
        >取消</ElButton
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-progress {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 2fr) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--juya-color-border-light);

  .task-copy {
    strong,
    span {
      display: block;
    }

    span {
      margin-top: 4px;
      color: var(--juya-color-text-secondary);
      font-size: 12px;
    }
  }

  .task-actions {
    min-width: 64px;
  }
}
</style>

<script setup lang="ts">
import type { UploadProgress } from '@/shared/types/media'
defineProps<{ progress: UploadProgress }>()
</script>
<template>
  <div class="upload-progress" role="status">
    <progress
      :value="progress.percent === null ? undefined : progress.percent"
      max="100"
      aria-label="文件传输进度"
    />
    <span>{{
      progress.percent === 100
        ? '上传完成，等待服务器确认'
        : progress.percent === null
          ? '正在上传'
          : `上传中 ${progress.percent}%`
    }}</span>
    <small
      >{{ (progress.loaded / 1024 / 1024).toFixed(2) }} MB<span v-if="progress.total !== null">
        / {{ (progress.total / 1024 / 1024).toFixed(2) }} MB</span
      ></small
    >
  </div>
</template>
<style scoped lang="scss">
.upload-progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  progress {
    width: 140px;
    accent-color: var(--green);
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

import type { SceneContent } from '@/features/content-editor/scene-form'
import type { UploadFile } from 'element-plus'

const props = defineProps<{
  form: SceneContent
  seriesTitle: string
  imageUrl: string
  mediaBusy: boolean
}>()
const emit = defineEmits<{ upload: [file: UploadFile]; refreshImage: [] }>()
const form = computed(() => props.form)
</script>
<template>
  <ElCard class="scene-draft-panel" shadow="never">
    <template #header>
      <h3>统一场景表单</h3>
      <p class="panel-description">人工录入与 OCR 候选都进入这份草稿</p>
    </template>
    <ElForm label-position="top">
      <ElFormItem label="所属系列">
        <ElInput :model-value="seriesTitle" disabled />
      </ElFormItem>
      <ElFormItem label="中文标题">
        <ElInput v-model="form.title_zh" aria-label="中文标题" maxlength="120" />
      </ElFormItem>
      <ElFormItem label="英文标题">
        <ElInput v-model="form.title_en" aria-label="英文标题" maxlength="120" />
      </ElFormItem>
      <ElFormItem label="场景说明">
        <ElInput v-model="form.summary" type="textarea" />
      </ElFormItem>
      <ElFormItem label="标签">
        <ElSelect v-model="form.tags" multiple filterable allow-create default-first-option>
          <ElOption v-for="tag in form.tags" :key="tag" :label="tag" :value="tag" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="学习原图素材编号">
        <ElInput v-model="form.original_image_asset_id" clearable @change="emit('refreshImage')" />
      </ElFormItem>
      <ElUpload
        :auto-upload="false"
        :show-file-list="false"
        accept="image/jpeg,image/png,image/webp"
        :disabled="mediaBusy"
        @change="emit('upload', $event)"
      >
        <ElButton :loading="mediaBusy">上传学习原图</ElButton>
      </ElUpload>
      <img v-if="imageUrl" class="original-image" :src="imageUrl" alt="学习原图" />
      <ElFormItem label="封面素材编号">
        <ElInput v-model="form.cover_asset_id" clearable />
      </ElFormItem>
      <ElFormItem label="版权声明">
        <ElInput v-model="form.copyright" type="textarea" />
      </ElFormItem>
      <ElFormItem label="内容来源"><ElInput v-model="form.source" /></ElFormItem>
    </ElForm>
  </ElCard>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 20px;
}

.scene-draft-panel {
  min-width: 0;
  min-height: 630px;
  background: #eaf2e3;
}

.scene-draft-panel :deep(.el-card__header) {
  padding: 18px 20px 8px;
  border-bottom: 0;
}

.scene-draft-panel :deep(.el-card__body) {
  padding: 12px 20px 24px;
}

.scene-draft-panel :deep(.el-form-item) {
  margin-bottom: 20px;
}

.scene-draft-panel :deep(.el-form) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.scene-draft-panel :deep(.el-form-item:nth-child(-n + 3)),
.scene-draft-panel :deep(.el-form-item:nth-child(6)),
.scene-draft-panel :deep(.el-upload),
.original-image {
  grid-column: 1 / -1;
}

.scene-draft-panel :deep(.el-form-item__label) {
  margin-bottom: 6px;
  color: var(--juya-color-text-regular);
  font-size: 13px;
  line-height: 22px;
}

.panel-description {
  margin: 8px 0 0;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}

.original-image {
  width: 100%;
  max-height: 320px;
  margin: 12px 0;
  object-fit: contain;
  border-radius: 12px;
}
</style>

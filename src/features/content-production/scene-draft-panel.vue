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
    <template #header><h3>基础信息与学习原图</h3></template>
    <ElForm label-position="top">
      <ElFormItem label="英文标题">
        <ElInput v-model="form.title_en" aria-label="英文标题" maxlength="120" />
      </ElFormItem>
      <ElFormItem label="中文标题">
        <ElInput v-model="form.title_zh" aria-label="中文标题" maxlength="120" />
      </ElFormItem>
      <ElFormItem label="所属系列">
        <ElInput :model-value="seriesTitle" disabled />
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
h3 {
  margin: 0;
  font-size: 15px;
}

.original-image {
  width: 100%;
  max-height: 320px;
  margin: 12px 0;
  object-fit: contain;
}
</style>

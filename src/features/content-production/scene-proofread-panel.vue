<script setup lang="ts">
import { computed } from 'vue'

import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import LexiconFields from '@/features/content-editor/lexicon-fields.vue'

import type { SceneContent } from '@/features/content-editor/scene-form'

const props = defineProps<{ form: SceneContent }>()
const emit = defineEmits<{ busy: [section: 'vocabulary' | 'chunks', value: boolean] }>()
const form = computed(() => props.form)
</script>
<template>
  <div class="scene-proofread-panel">
    <ElCard shadow="never">
      <template #header><h3>对话与句子</h3></template>
      <DialogueFields v-model="form.dialogue" />
    </ElCard>
    <ElCard shadow="never">
      <template #header><h3>核心词汇</h3></template>
      <LexiconFields
        v-model="form.vocabulary"
        entry-type="vocabulary"
        :sentences="form.dialogue"
        :original-image-asset-id="form.original_image_asset_id"
        @busy="emit('busy', 'vocabulary', $event)"
      />
    </ElCard>
    <ElCard shadow="never">
      <template #header><h3>常用语块</h3></template>
      <LexiconFields
        v-model="form.chunks"
        entry-type="chunk"
        :sentences="form.dialogue"
        :original-image-asset-id="form.original_image_asset_id"
        @busy="emit('busy', 'chunks', $event)"
      />
    </ElCard>
  </div>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.scene-proofread-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 20px;
}

.scene-proofread-panel :deep(.el-card__header) {
  padding: 18px 20px;
  border-bottom: 0;
}

.scene-proofread-panel :deep(.el-card__body) {
  padding-top: 0;
}
</style>

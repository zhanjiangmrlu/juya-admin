<script setup lang="ts">
import { computed } from 'vue'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import LexiconFields from '@/features/content-editor/lexicon-fields.vue'

import type { SceneContent } from '@/features/content-editor/scene-form'

const props = defineProps<{ form: SceneContent }>()
const emit = defineEmits<{
  busy: [section: 'vocabulary' | 'chunks', value: boolean]
  confirm: [section: 'vocabulary' | 'chunks', index: number]
}>()
const form = computed(() => props.form)
const wordCard = computed(
  () => form.value.template_type === 'word_card' || form.value.template_type === 'vocabulary'
)
</script>
<template>
  <div class="scene-proofread-panel admin-brand-headings">
    <ElAlert
      v-if="wordCard"
      title="原词汇卡：核对主体单词与本篇释义，不要求对话、整段音频或句子切片"
      type="info"
      :closable="false"
    />
    <AdminPanel v-if="!wordCard" :title="ADMIN_SECTION_TITLES.sceneProofreadPanel.dialogue">
      <DialogueFields v-model="form.dialogue" />
    </AdminPanel>
    <AdminPanel :title="ADMIN_SECTION_TITLES.sceneProofreadPanel.vocabulary">
      <LexiconFields
        v-model="form.vocabulary"
        entry-type="vocabulary"
        :modern="form.schema_version === 2"
        :sentences="form.dialogue"
        :original-image-asset-id="form.original_image_asset_id"
        @busy="emit('busy', 'vocabulary', $event)"
        @confirm="emit('confirm', 'vocabulary', $event)"
      />
    </AdminPanel>
    <AdminPanel :title="ADMIN_SECTION_TITLES.sceneProofreadPanel.chunks">
      <LexiconFields
        v-model="form.chunks"
        entry-type="chunk"
        :modern="form.schema_version === 2"
        :sentences="form.dialogue"
        :original-image-asset-id="form.original_image_asset_id"
        @busy="emit('busy', 'chunks', $event)"
        @confirm="emit('confirm', 'chunks', $event)"
      />
    </AdminPanel>
  </div>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.scene-proofread-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.scene-proofread-panel :deep(.el-card__header) {
  padding: 18px 20px;
  border-bottom: 0;
}

.scene-proofread-panel :deep(.el-card__body) {
  padding-top: 0;
}
</style>

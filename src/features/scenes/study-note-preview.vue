<script setup lang="ts">
import { ElButton } from 'element-plus'
import { computed, ref } from 'vue'

import AppIcon from '@/components/app-icon/app-icon.vue'

import type { components } from '@/shared/contracts/generated/admin-api'

import StudyNoteViewer from './study-note-viewer.vue'
const props = defineProps<{
  note?: components['schemas']['StudyNoteDraft'] | components['schemas']['StudyNoteMetadata'] | null
}>()
const open = ref(false)
const mediaId = computed(() => {
  const note = props.note
  if (!note) return ''
  if ('media_id' in note) return note.media_id
  return note.can_publish && note.action !== 'remove' ? note.attachment?.id || '' : ''
})
</script>
<template>
  <ElButton v-if="mediaId" class="note-entry" link @click="open = true"
    ><AppIcon name="cards" :size="18" />查看学习笔记</ElButton
  ><StudyNoteViewer v-if="open && mediaId" :media-id="mediaId" @close="open = false" />
</template>
<style scoped lang="scss">
.note-entry {
  display: flex;
  margin-left: auto;
  color: #41664d;
  min-height: 44px;
}
</style>

<script setup lang="ts">
import type { components } from '@/shared/contracts/generated/admin-api'
import type { ScenePronunciationContext } from '@/shared/types/scene-components'

import SceneReader from './scene-reader.vue'
defineProps<{
  content: components['schemas']['SceneContent']
  mode: 'draft' | 'published'
  pronunciation?: ScenePronunciationContext
  busy?: boolean
  error?: string
}>()
defineEmits<{ close: []; publish: [] }>()
</script>
<template>
  <ElDialog
    :model-value="true"
    :title="mode === 'published' ? '已发布内容 · 只读查看' : '发布前预览'"
    width="465px"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    @close="$emit('close')"
    ><div class="preview-scroll">
      <SceneReader :content="content" :pronunciation="pronunciation" />
    </div>
    <template #footer
      ><p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <div class="row preview-footer">
        <button type="button" :disabled="busy" @click="$emit('close')">
          {{ mode === 'published' ? '关闭预览' : '返回修改' }}</button
        ><button
          v-if="mode === 'draft'"
          type="button"
          class="primary"
          :disabled="busy"
          @click="$emit('publish')"
        >
          {{ busy ? '正在发布…' : '确认发布' }}
        </button>
      </div></template
    ></ElDialog
  >
</template>
<style scoped lang="scss">
.preview-scroll {
  max-height: 65vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.preview-footer {
  justify-content: flex-end;
}
</style>

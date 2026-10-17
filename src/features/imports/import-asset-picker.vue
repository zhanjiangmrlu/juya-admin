<script setup lang="ts">
import { computed } from 'vue'

import { mediaURL } from '@/services/display'

import type { SceneContent } from '@/features/scenes/editor-model'
import type { ImportBatch } from '@/shared/types/import'
const content = defineModel<SceneContent>({ required: true })
const props = defineProps<{ batch: ImportBatch; itemId: string; disabled?: boolean }>()
const available = computed(() =>
  props.batch.files.filter(
    (file) => ['image', 'audio'].includes(file.kind) && file.media_id && file.state === 'ready'
  )
)
/** 显示素材当前绑定，避免只按上传顺序猜配
 * @param id 已准备好素材的内部引用
 * @returns 该素材在本批的已保存归属名称
 */
const usedBy = (id: string) =>
  props.batch.items
    .filter(
      (item) =>
        item.id !== props.itemId && (item.content.image_id === id || item.content.audio_id === id)
    )
    .map((item) => item.content.name)
    .join('、')
</script>
<template>
  <details v-if="available.length" class="panel asset-picker">
    <summary>从本次已上传资料选择对应素材</summary>
    <p class="small muted">请选择对应图片和完整音频；不同名称或多份候选不会自动绑定。</p>
    <div class="asset-grid">
      <label
        v-for="file in available"
        :key="file.id"
        :class="{
          chosen: content.image_id === file.media_id || content.audio_id === file.media_id
        }"
      >
        <img
          v-if="file.kind === 'image'"
          :src="mediaURL(file.media_id)"
          :alt="file.name"
          loading="lazy"
        /><audio v-else :src="mediaURL(file.media_id)" controls preload="none" />
        <span>{{ file.name }}</span
        ><small v-if="usedBy(file.media_id!)" class="muted"
          >同时用于：{{ usedBy(file.media_id!) }}</small
        >
        <button
          type="button"
          :disabled="disabled"
          @click="
            file.kind === 'image'
              ? (content.image_id = file.media_id)
              : (content.audio_id = file.media_id)
          "
        >
          {{
            content.image_id === file.media_id || content.audio_id === file.media_id
              ? '已选择'
              : file.kind === 'image'
                ? '用作场景图'
                : '用作完整音频'
          }}
        </button>
      </label>
    </div>
    <div class="row">
      <button
        type="button"
        class="text small"
        :disabled="disabled"
        @click="content.image_id = null"
      >
        取消图片对应</button
      ><button
        type="button"
        class="text small"
        :disabled="disabled"
        @click="content.audio_id = null"
      >
        取消音频对应
      </button>
    </div>
  </details>
</template>
<style scoped lang="scss">
.asset-picker {
  summary {
    cursor: pointer;
    font-weight: 600;
  }

  p {
    margin: 14px 0;
  }
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  > label {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px;
    font-size: 12px;
    overflow-wrap: anywhere;

    &.chosen {
      border-color: var(--green);
      background: var(--soft);
    }

    img {
      height: 100px;
      width: 100%;
      object-fit: contain;
    }

    audio {
      width: 100%;
      height: 38px;
    }
  }
}
</style>

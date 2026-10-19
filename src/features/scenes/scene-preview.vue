<script setup lang="ts">
import type { components } from '@/shared/contracts/generated/admin-api'
import type { ScenePronunciationContext } from '@/shared/types/scene-components'

import SceneReader from './scene-reader.vue'
defineProps<{
  content: components['schemas']['SceneContent']
  mode: 'draft' | 'published' | 'import'
  pronunciation?: ScenePronunciationContext
  busy?: boolean
  error?: string
}>()
defineEmits<{ close: []; publish: [] }>()
</script>
<template>
  <ElDialog
    class="scene-preview"
    :model-value="true"
    :title="
      mode === 'import'
        ? '导入核对预览 · 尚未保存为卡片草稿'
        : mode === 'published'
          ? '已发布内容 · 只读查看'
          : '发布前预览'
    "
    width="516px"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @close="$emit('close')"
    ><div class="preview-scroll">
      <SceneReader
        phone
        :content="content"
        :pronunciation="pronunciation"
        @close="!busy && $emit('close')"
      />
    </div>
    <template #footer
      ><p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <div class="row preview-footer">
        <button type="button" :disabled="busy" @click="$emit('close')">
          {{
            mode === 'import' ? '返回核对' : mode === 'published' ? '关闭预览' : '返回修改'
          }}</button
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
<style lang="scss">
.scene-preview:where(.el-dialog) {
  display: flex;
  flex-direction: column;
  height: min(905px, calc(100dvh - 80px));
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
  max-height: calc(100dvh - 80px);

  [class~='el-dialog__header'],
  [class~='el-dialog__footer'] {
    flex-shrink: 0;
  }

  [class~='el-dialog__header'] {
    padding: 22px;
    margin: 0;
    min-height: 65px;
    border-bottom: 1px solid var(--line);
  }

  [class~='el-dialog__title'] {
    font-size: 16px;
    font-weight: 700;
  }

  [class~='el-dialog__headerbtn'] {
    top: 12px;
    right: 10px;
  }

  [class~='el-dialog__body'] {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    max-height: none;
    background: var(--bg);
  }

  .preview-scroll {
    height: 100%;
    min-height: 0;
    overflow: auto;
    scrollbar-gutter: stable;
    padding: 20px 0;
  }

  [class~='el-dialog__footer'] {
    padding: 16px 22px;
    border-top: 1px solid var(--line);
    min-height: 72px;
    display: block;
  }

  .preview-footer {
    justify-content: space-between;

    button {
      min-width: 112px;
    }
  }

  .notice {
    margin-bottom: 12px;
  }
}
</style>

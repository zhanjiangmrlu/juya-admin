<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import AppAudioPlayer from '@/components/app-audio-player/app-audio-player.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import {
  createImportResourcePreviewAdapter,
  type ImportResourcePreview
} from './import-resource-preview-adapter'

const props = defineProps<{
  batchId: string
  path: string
  disabled?: boolean
  source?: 'imports' | 'materials'
}>()
const adapter = createImportResourcePreviewAdapter(useAdminApiClient(), props.source)
const preview = shallowRef<ImportResourcePreview | null>(null)
const busy = ref(false)
const error = ref('')
let generation = 0
let controller: globalThis.AbortController | null = null
const /** 手动申请短期预览，过期后不沿用旧文件地址 */ load = async (): Promise<void> => {
    if (!adapter.available || busy.value || props.disabled || !props.path) return
    const token = ++generation
    controller?.abort()
    controller = new globalThis.AbortController()
    busy.value = true
    preview.value = null
    error.value = ''
    try {
      const result = await adapter.preview(props.batchId, props.path, controller.signal)
      if (token === generation) preview.value = result
    } catch (failure) {
      if (token === generation)
        error.value = failure instanceof Error ? failure.message : '素材预览失败'
    } finally {
      if (token === generation) busy.value = false
    }
  }
const /** 释放受限素材，防止跨批次或离页继续播放 */ clear = (): void => {
    generation++
    controller?.abort()
    preview.value = null
    busy.value = false
    error.value = ''
  }
const /** 图片已过期或加载失败后撤销地址，要求明确刷新 */ failed = (): void => {
    preview.value = null
    error.value = '素材预览已过期或不可用，请重新读取'
  }
watch(() => [props.batchId, props.path], clear, { flush: 'sync' })
onBeforeUnmount(clear)
</script>
<template>
  <div class="import-resource-preview">
    <ElButton
      v-if="adapter.available"
      link
      :disabled="disabled || !path"
      :loading="busy"
      @click="load"
      >{{ preview ? '刷新素材预览' : '预览此素材' }}</ElButton
    >
    <small v-else>素材预览等待服务装配</small>
    <small v-if="error">{{ error }}</small>
    <template v-if="preview">
      <img
        v-if="preview.contentType.startsWith('image/')"
        :src="preview.url"
        alt="导入素材受控预览"
        @error="failed"
      />
      <AppAudioPlayer v-else :src="preview.url" />
      <small>仅供管理员核对原始素材，不代表已审核、已确认或已发布；失效后可刷新</small>
    </template>
  </div>
</template>
<style scoped lang="scss">
.import-resource-preview {
  display: grid;
  gap: 6px;
  min-width: 0;

  img {
    width: 100%;
    max-width: 240px;
    max-height: 180px;
    object-fit: contain;
  }

  small {
    color: var(--juya-color-text-secondary);
    overflow-wrap: anywhere;
  }
}
</style>

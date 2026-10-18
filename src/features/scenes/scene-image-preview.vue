<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { mediaURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'

import type { CardView } from './editor-model'
const props = defineProps<{ card: CardView }>()
const emit = defineEmits<{ close: []; invalid: [] }>()
const source = ref(''),
  error = ref(''),
  loading = ref(true),
  scale = ref(1),
  x = ref(0),
  y = ref(0)
let pointer: { id: number; x: number; y: number } | null = null
/** 原图读取前复核展示版本，候选稿不替换发布图 */
const load = async () => {
  loading.value = true
  error.value = ''
  source.value = ''
  try {
    const latest = await api.request<CardView>(`/api/admin/v1/cards/${props.card.id}`)
    if (
      latest.status !== props.card.status ||
      latest.current_version_id !== props.card.current_version_id ||
      (latest.status === 'draft' && latest.draft_revision !== props.card.draft_revision) ||
      latest.display_image_id !== props.card.display_image_id
    ) {
      emit('invalid')
      return
    }
    if (!latest.display_image_id) {
      error.value = '暂无场景图'
      loading.value = false
      return
    }
    source.value = mediaURL(latest.display_image_id)
  } catch (reason) {
    if (reason instanceof ApiError && [404, 409, 410].includes(reason.status)) emit('invalid')
    else error.value = reason instanceof Error ? reason.message : '图片加载失败'
    loading.value = false
  }
}
/** 图片失败允许同位重试，并再次核对版本 */
const failed = () => {
  loading.value = false
  error.value = '图片加载失败，请重试'
}
/** 缩放保持原比例，恢复原尺寸时重置拖动位置
 * @param amount 目标缩放倍数
 */
const zoom = (amount: number) => {
  scale.value = Math.max(1, Math.min(5, amount))
  if (scale.value === 1) {
    x.value = 0
    y.value = 0
  }
}
/** 放大后记录拖动起点
 * @param event 原图区域指针事件
 */
const start = (event: PointerEvent) => {
  if (scale.value <= 1) return
  pointer = { id: event.pointerId, x: event.clientX - x.value, y: event.clientY - y.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
/** 仅当前指针可以移动原图
 * @param event 当前拖动事件
 */
const drag = (event: PointerEvent) => {
  if (pointer?.id === event.pointerId) {
    x.value = event.clientX - pointer.x
    y.value = event.clientY - pointer.y
  }
}
onMounted(load)
</script>
<template>
  <ElDialog
    :model-value="true"
    :title="`${card.display_name || '卡片'} · 场景大图`"
    width="min(1100px,95vw)"
    append-to-body
    @close="emit('close')"
  >
    <div class="image-controls">
      <button aria-label="缩小场景图" :disabled="scale <= 1" @click="zoom(scale - 0.25)">
        缩小</button
      ><span>{{ Math.round(scale * 100) }}%</span
      ><button aria-label="放大场景图" :disabled="scale >= 5" @click="zoom(scale + 0.25)">
        放大</button
      ><button @click="zoom(1)">恢复原比例</button><button @click="emit('close')">关闭大图</button>
    </div>
    <p v-if="loading" role="status">图片加载中…</p>
    <p v-if="error" role="alert">
      {{ error
      }}<button v-if="error !== '暂无场景图'" data-action="retry-image" @click="load">重试</button>
    </p>
    <div
      v-if="source && !error"
      class="image-viewport"
      :class="{ enlarged: scale > 1 }"
      @pointerdown="start"
      @pointermove="drag"
      @pointerup="pointer = null"
      @pointercancel="pointer = null"
    >
      <img
        :src="source"
        :alt="card.display_name"
        :style="{ transform: `translate(${x}px, ${y}px) scale(${scale})` }"
        draggable="false"
        @load="loading = false"
        @error="failed"
      />
    </div>
  </ElDialog>
</template>
<style scoped lang="scss">
.image-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.image-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 200px;
  height: 65vh;
  background: var(--soft);
  touch-action: none;

  &.enlarged {
    cursor: grab;
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform-origin: center;
    user-select: none;
  }
}
</style>

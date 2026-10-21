<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { mediaURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'
import { sceneImageId } from '@/services/scene-image'

import type { CardView } from './editor-model'
const props = defineProps<{ card: CardView }>()
const emit = defineEmits<{ close: []; invalid: [] }>()
const source = ref(''),
  error = ref(''),
  loading = ref(true),
  scale = ref(1),
  viewport = ref<HTMLElement | null>(null),
  viewportSize = ref({ width: 0, height: 0 }),
  imageSize = ref({ width: 0, height: 0 })
let pointer: { id: number; x: number; y: number } | null = null
let observer: ResizeObserver | undefined
/** 根据容器和原图比例计算真实占位尺寸，让放大后的所有边缘可滚动到达 */
const imageStyle = computed(() => {
  const { width, height } = imageSize.value
  const fit =
    width && height
      ? Math.min(1, viewportSize.value.width / width, viewportSize.value.height / height)
      : 0
  return { width: `${width * fit * scale.value}px`, height: `${height * fit * scale.value}px` }
})
/** 记录预览区域尺寸，窗口变化时重新适配完整图片 */
const measure = () => {
  if (!viewport.value) return
  viewportSize.value = { width: viewport.value.offsetWidth, height: viewport.value.offsetHeight }
}
watch(viewport, (element) => {
  observer?.disconnect()
  if (!element) return
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(element)
})
/** 图片加载完成后按原始宽高比例计算展示尺寸
 * @param event 已完成加载的场景图片事件
 */
const loaded = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement
  imageSize.value = { width: image.naturalWidth, height: image.naturalHeight }
  measure()
  loading.value = false
}
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
    source.value = mediaURL(
      sceneImageId(latest.display_thumbnail_id, latest.display_image_id, true)
    )
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
/** 缩放保持原比例，恢复适配尺寸时回到滚动起点
 * @param amount 目标缩放倍数
 */
const zoom = async (amount: number) => {
  pointer = null
  scale.value = Math.max(1, Math.min(5, amount))
  if (scale.value === 1) {
    await nextTick()
    viewport.value?.scrollTo(0, 0)
  }
}
/** 放大后记录拖动起点
 * @param event 原图区域指针事件
 */
const start = (event: PointerEvent) => {
  if (scale.value <= 1 || event.button !== 0 || event.pointerType === 'touch' || !viewport.value)
    return
  pointer = {
    id: event.pointerId,
    x: event.clientX + viewport.value.scrollLeft,
    y: event.clientY + viewport.value.scrollTop
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}
/** 仅当前指针可以移动原图
 * @param event 当前拖动事件
 */
const drag = (event: PointerEvent) => {
  if (pointer?.id === event.pointerId && viewport.value) {
    viewport.value.scrollLeft = pointer.x - event.clientX
    viewport.value.scrollTop = pointer.y - event.clientY
  }
}
onMounted(load)
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <ElDialog
    :model-value="true"
    :title="`${card.display_name || '卡片'} · 场景大图`"
    width="min(1100px,95vw)"
    align-center
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
      ref="viewport"
      class="image-viewport"
      :class="{ enlarged: scale > 1 }"
      @pointerdown="start"
      @pointermove="drag"
      @pointerup="pointer = null"
      @pointercancel="pointer = null"
      @lostpointercapture="pointer = null"
    >
      <div class="image-canvas" :style="imageStyle">
        <img
          :src="source"
          :alt="card.display_name"
          :style="imageStyle"
          draggable="false"
          @load="loaded"
          @error="failed"
        />
      </div>
    </div>
  </ElDialog>
</template>
<style scoped lang="scss">
.image-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.image-viewport {
  overflow: auto;
  height: min(65vh, calc(100dvh - 200px));
  background: var(--soft);

  &.enlarged {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  .image-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 100%;
    min-height: 100%;
  }

  img {
    display: block;
    flex-shrink: 0;
    max-width: none;
    user-select: none;
  }
}
</style>

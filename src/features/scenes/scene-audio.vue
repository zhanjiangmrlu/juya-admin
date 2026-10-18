<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { claimAudioFocus } from '@/services/audio-focus'
import { mediaURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{
  mediaId?: string | null
  metadata?: components['schemas']['MediaMetadata'] | null
}>()
const emit = defineEmits<{ play: [] }>()
const audio = ref<HTMLAudioElement | null>(null),
  current = ref<components['schemas']['MediaMetadata'] | null>(null)
const reading = ref(true),
  ready = ref(false),
  error = ref(''),
  attempt = ref(0)
const format = computed(
  () =>
    ({ 'audio/mpeg': 'MP3', 'audio/mp4': 'M4A', 'audio/wav': 'WAV', 'audio/aac': 'AAC' })[
      current.value?.content_type || ''
    ] || ''
)
const source = computed(() =>
  props.mediaId ? `${mediaURL(props.mediaId)}?load=${attempt.value}` : ''
)
let generation = 0,
  alive = true
/** 统一停止当前完整音频，供切卡及词汇试听复用 */
const stop = () => {
  audio.value?.pause()
}
/** 展示服务器确认的真实总时长
 * @param seconds 已验证的秒数
 * @returns 分秒时长
 */
const durationText = (seconds?: number | null) =>
  seconds && Number.isFinite(seconds) && seconds > 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : ''
/** 查询上传事实与服务器校验结果，客户端读取失败不改写它们 */
const load = async () => {
  stop()
  const run = ++generation
  ready.value = false
  reading.value = true
  error.value = ''
  current.value = null
  if (!props.mediaId) {
    reading.value = false
    return
  }
  try {
    const value =
      props.metadata?.id === props.mediaId
        ? props.metadata
        : await api.request<components['schemas']['MediaMetadata']>(
            `/api/admin/v1/media/${encodeURIComponent(props.mediaId)}/status`
          )
    if (alive && run === generation) {
      current.value = value
      reading.value = false
    }
  } catch (reason) {
    if (alive && run === generation) {
      error.value = reason instanceof Error ? reason.message : '音频读取失败'
      reading.value = false
    }
  }
}
/** 浏览器元数据必须实际就绪，不能以播放器初始零时长宣称可播 */
const loaded = () => {
  if (audio.value && Number.isFinite(audio.value.duration) && audio.value.duration > 0) {
    ready.value = true
    error.value = ''
  } else error.value = '音频读取失败，请重试加载'
}
/** 传输或解码读取失败保留服务器已上传事实 */
const failed = () => {
  ready.value = false
  error.value = '音频读取失败，请重试加载'
}
/** 明确重试同一有效引用，不重新上传 */
const retry = () => {
  attempt.value++
  void load()
}
/** 主音频由用户主动播放时抢占其他试听 */
const play = () => {
  if (audio.value) claimAudioFocus(audio.value)
  emit('play')
}
watch(() => [props.mediaId, props.metadata], load, { immediate: true })
onBeforeUnmount(() => {
  alive = false
  generation++
  stop()
})
defineExpose({ stop })
</script>
<template>
  <div class="scene-audio">
    <p v-if="!mediaId" class="muted">未上传完整音频</p>
    <template v-else>
      <p>
        已上传 · {{ current?.original_name || '历史音频（原文件名未记录）'
        }}<span v-if="current?.duration"> · {{ durationText(current.duration) }}</span>
      </p>
      <p v-if="format" class="muted">原格式：{{ format }}</p>
      <p v-if="current?.state === 'failed'" role="alert">
        音频处理失败 · {{ current.error || '请重新上传或选择其他文件' }}
      </p>
      <p v-else-if="current && current.state !== 'ready'" role="status">
        {{
          current.processing_stage === 'converting'
            ? '已上传，正在兼容处理为 MP3'
            : '已上传，正在校验音频'
        }}
      </p>
      <template v-else>
        <p v-if="current?.playback_content_type === 'audio/mpeg'" class="muted">
          MP3 播放资源已就绪
        </p>
        <p v-if="!ready && !error" role="status">
          {{ reading ? '正在读取音频资料' : '时长读取中' }}
        </p>
        <p v-if="error" class="error" role="alert">
          {{ error
          }}<button type="button" data-action="retry-audio-read" @click="retry">重试读取</button>
        </p>
        <audio
          v-if="mediaId && (!current || current.state === 'ready')"
          ref="audio"
          :key="`${mediaId}-${attempt}`"
          :src="current?.state === 'ready' ? source : undefined"
          :controls="ready && !error"
          :preload="current?.state === 'ready' ? 'metadata' : 'none'"
          @loadedmetadata="loaded"
          @error="failed"
          @play="play"
        />
      </template>
    </template>
  </div>
</template>
<style scoped lang="scss">
.scene-audio {
  overflow-wrap: anywhere;

  p {
    margin: 6px 0;
    font-size: 12px;
  }

  audio {
    width: 100%;
    height: 38px;
  }
}
</style>

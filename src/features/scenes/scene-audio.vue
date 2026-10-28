<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from '@/components/app-icon/app-icon.vue'
import { claimAudioFocus } from '@/services/audio-focus'
import { mediaURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{
  variant?: 'editor' | 'preview'
  mediaId?: string | null
  metadata?: components['schemas']['MediaMetadata'] | null
  sourceUrl?: string
  inlineRates?: boolean
  title?: string
  subtitle?: string
  compact?: boolean
}>()
const emit = defineEmits<{ play: []; position: [seconds: number] }>()
const audio = ref<HTMLAudioElement | null>(null),
  current = ref<components['schemas']['MediaMetadata'] | null>(null)
const reading = ref(true),
  ready = ref(false),
  error = ref(''),
  attempt = ref(0),
  playing = ref(false),
  position = ref(0),
  speed = ref(1),
  playbackError = ref('')
const ratesOpen = ref(false)
const format = computed(
  () =>
    ({ 'audio/mpeg': 'MP3', 'audio/mp4': 'M4A', 'audio/wav': 'WAV', 'audio/aac': 'AAC' })[
      current.value?.content_type || ''
    ] || ''
)
const source = computed(() =>
  props.sourceUrl
    ? `${props.sourceUrl}${props.sourceUrl.includes('?') ? '&' : '?'}load=${attempt.value}`
    : props.mediaId
      ? `${mediaURL(props.mediaId)}?load=${attempt.value}`
      : ''
)
let generation = 0,
  alive = true
let frame = 0
/** 统一停止当前完整音频，供切卡及词汇试听复用 */
const stop = () => {
  cancelAnimationFrame(frame)
  audio.value?.pause()
  playing.value = false
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
  playbackError.value = ''
  position.value = 0
  current.value = null
  if (!props.mediaId) {
    reading.value = false
    return
  }
  if (props.sourceUrl) {
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
    audio.value.playbackRate = speed.value
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
  playbackError.value = ''
  playing.value = true
  if (audio.value) claimAudioFocus(audio.value)
  emit('play')
  if (props.sourceUrl) {
    cancelAnimationFrame(frame)
    trackPosition()
  }
}
/** 直接受控音频逐帧读取媒体时间，暂停和缓冲不推算时钟 */
const trackPosition = () => {
  updatePosition()
  if (audio.value && !audio.value.paused && !audio.value.ended)
    frame = requestAnimationFrame(trackPosition)
}
/** 播放暂停或结束时冻结最后真实位置 */
const paused = () => {
  cancelAnimationFrame(frame)
  playing.value = false
  updatePosition()
}
/** 切换真实音频播放，失败时保留已上传事实供重试 */
const toggle = async () => {
  const element = audio.value
  if (!element || !ready.value || error.value) return
  if (!element.paused) {
    stop()
    return
  }
  const run = generation
  try {
    await element.play()
  } catch {
    if (alive && run === generation) playbackError.value = '音频播放失败，请重试'
  }
}
/** 同步真实播放位置，拖动滑块不改变音频版本 */
const updatePosition = () => {
  position.value = audio.value?.currentTime || 0
  emit('position', position.value)
}
/** 按管理员选择的实际秒数定位音频
 * @param event 播放进度滑块输入事件
 */
const seek = (event: Event) => {
  if (!audio.value || !ready.value) return
  audio.value.currentTime = Number((event.target as HTMLInputElement).value)
  updatePosition()
}
/** 修改当前完整音频的播放速率，失败时保留已生效档位
 * @param event 倍速下拉框的选择事件
 */
const changeSpeed = (event: Event) => {
  const rate = Number((event.target as HTMLSelectElement).value)
  if (!audio.value || ![1, 1.25, 1.5, 1.75, 2].includes(rate)) return
  try {
    audio.value.playbackRate = rate
    speed.value = rate
    playbackError.value = ''
  } catch {
    ;(event.target as HTMLSelectElement).value = String(speed.value)
    playbackError.value = '倍速设置失败，请重试'
  }
}
/** 选择听读播放器内部五档倍速，不改变播放暂停状态
 * @param rate 管理员选择的倍速
 */
const setInlineRate = (rate: number) => {
  if (!audio.value || ![1, 1.25, 1.5, 1.75, 2].includes(rate)) return
  audio.value.playbackRate = rate
  speed.value = rate
  ratesOpen.value = false
}
watch(() => [props.mediaId, props.metadata, props.sourceUrl], load, { immediate: true })
onBeforeUnmount(() => {
  alive = false
  generation++
  stop()
})
defineExpose({ stop })
</script>
<template>
  <div
    class="scene-audio"
    :class="{ 'preview-player': variant === 'preview', 'compact-player': compact }"
  >
    <p v-if="!mediaId" class="muted">未上传完整音频</p>
    <template v-else>
      <p v-if="variant !== 'preview'">
        已上传 · {{ current?.original_name || '历史音频（原文件名未记录）'
        }}<span v-if="current?.duration"> · {{ durationText(current.duration) }}</span>
      </p>
      <p v-if="format && variant !== 'preview'" class="muted">原格式：{{ format }}</p>
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
        <p
          v-if="current?.playback_content_type === 'audio/mpeg' && variant !== 'preview'"
          class="muted"
        >
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
          :src="sourceUrl || current?.state === 'ready' ? source : undefined"
          :controls="variant !== 'preview' && ready && !error"
          :preload="sourceUrl || current?.state === 'ready' ? 'metadata' : 'none'"
          @loadedmetadata="loaded"
          @error="failed"
          @play="play"
          @pause="paused"
          @ended="paused"
          @timeupdate="updatePosition"
        />
        <div v-if="variant === 'preview'" class="player-controls">
          <button
            type="button"
            class="play-toggle"
            :aria-label="playing ? '暂停完整音频' : '播放完整音频'"
            :disabled="!ready || !!error"
            @click="toggle"
          >
            <span v-if="playing" class="pause-symbol" aria-hidden="true">Ⅱ</span
            ><AppIcon v-else name="play" />
          </button>
          <div class="player-copy">
            <strong>{{ title || '完整对话音频' }}</strong
            ><small>{{ subtitle || 'LISTEN TO THE FULL DIALOGUE' }}</small>
            <p>
              {{ durationText(position) || '0:00' }} /
              {{ ready ? durationText(audio?.duration) : '—' }} · 整篇播放
            </p>
          </div>
          <select
            v-if="!inlineRates"
            :value="speed"
            aria-label="完整音频倍速"
            :disabled="!ready || !!error"
            @change="changeSpeed"
          >
            <option v-for="rate in [1, 1.25, 1.5, 1.75, 2]" :key="rate" :value="rate">
              {{ rate }}× 倍速
            </option>
          </select>
          <button
            v-else
            type="button"
            class="rate-toggle"
            aria-label="展开完整音频倍速"
            :disabled="!ready || Boolean(error)"
            @click="ratesOpen = !ratesOpen"
          >
            {{ speed }}×
          </button>
          <input
            type="range"
            aria-label="完整音频播放进度"
            min="0"
            :max="ready ? audio?.duration : 0"
            step="0.1"
            :value="position"
            :disabled="!ready || !!error"
            @input="seek"
          />
          <div v-if="inlineRates && ratesOpen" class="inline-rates">
            <button
              v-for="rate in [1, 1.25, 1.5, 1.75, 2]"
              :key="rate"
              type="button"
              :class="{ primary: speed === rate }"
              @click="setInlineRate(rate)"
            >
              {{ rate }}×
            </button>
          </div>
          <p v-if="playbackError" class="error" role="alert">{{ playbackError }}</p>
        </div>
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

<style scoped lang="scss">
.preview-player {
  position: relative;
  padding: 22px;
  border-radius: 16px;
  background: var(--soft);

  > p,
  > [role='status'] {
    font-size: 12px;
  }

  audio {
    display: none;
  }

  .player-controls {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .play-toggle {
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #bedda7;
  }

  .pause-symbol {
    font-size: 24px;
  }

  .player-copy {
    min-width: 0;

    strong {
      display: block;
      font-size: 14px;
      font-weight: 500;
    }

    small {
      display: block;
      font-size: 9px;
      letter-spacing: 0.9px;
      margin: 4px 0 8px;
    }

    p {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
    }
  }

  select {
    width: 62px;
    padding: 8px 4px;
    font-size: 12px;
    min-height: 44px;
    background: #fffcf5;
  }

  input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    height: 20px;
    min-height: 20px;
    padding: 0;
    border: 0;
    accent-color: #426851;
    background: transparent;
  }

  .error {
    grid-column: 1 / -1;
    color: var(--red);
  }

  .inline-rates {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;

    button {
      min-height: 44px;
      min-width: 44px;
    }
  }

  &.compact-player {
    padding: 16px;

    .player-controls {
      gap: 12px;
    }

    :where(.player-copy) {
      small {
        display: none;
      }

      p {
        font-size: 11px;
        white-space: nowrap;
      }
    }
  }
}
</style>

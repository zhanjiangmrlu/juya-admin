<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { mediaURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{ kind: 'image' | 'audio'; modelValue?: string | null; limit: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; busy: [value: boolean] }>()
const busy = ref(false),
  percent = ref(0),
  error = ref(''),
  metadata = ref<components['schemas']['MediaMetadata'] | null>(null),
  audio = ref<HTMLAudioElement | null>(null)
let selected: File | null = null,
  key = '',
  alive = true
const accept = computed(() =>
  props.kind === 'image' ? '.jpg,.jpeg,.png,.webp' : '.mp3,.m4a,.wav,.aac'
)
/** 上传成功且处理完成才替换原素材，失败可复用原请求键 */
const send = async () => {
  if (!selected || busy.value) return
  busy.value = true
  emit('busy', true)
  error.value = ''
  percent.value = 0
  try {
    const form = new FormData()
    form.append('file', selected)
    let value = await api.upload<components['schemas']['MediaMetadata']>(
      `/api/admin/v1/media?kind=${props.kind}`,
      form,
      key,
      (value) => {
        percent.value = value
      }
    )
    while (alive && !['ready', 'failed'].includes(value.state)) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (!alive) return
      value = await api.request(`/api/admin/v1/media/${value.id}/status`)
    }
    if (!alive) return
    if (value.state !== 'ready') throw new Error(value.error || '素材处理失败，请重试')
    metadata.value = value
    emit('update:modelValue', value.id)
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '上传失败，请重试'
  } finally {
    if (alive) {
      busy.value = false
      emit('busy', false)
    }
  }
}
/** 选择新素材前校验当前环境限制
 * @param event 文件选择事件
 */
const choose = (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > props.limit) {
    error.value = `文件不能超过 ${Math.floor(props.limit / 1024 / 1024)} MB`
    return
  }
  selected = file
  key = crypto.randomUUID()
  void send()
}
watch(
  () => props.modelValue,
  async (id) => {
    if (id) {
      try {
        metadata.value = await api.request(`/api/admin/v1/media/${id}/status`)
      } catch {
        metadata.value = null
      }
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  alive = false
  audio.value?.pause()
})
</script>
<template>
  <div class="media-field">
    <p class="field-title">{{ kind === 'image' ? '场景图片' : '完整音频' }}</p>
    <div v-if="modelValue" class="current">
      <img v-if="kind === 'image'" :src="mediaURL(modelValue)" alt="当前场景图" /><audio
        v-else
        ref="audio"
        :src="mediaURL(modelValue)"
        preload="none"
        controls
      />
      <p class="small muted">
        {{ metadata?.original_name || (kind === 'image' ? '场景图片' : '完整音频')
        }}<span v-if="metadata?.duration"> · {{ Math.round(metadata.duration) }} 秒</span>
      </p>
    </div>
    <label class="upload-button"
      ><input type="file" :accept="accept" :disabled="busy || !limit" @change="choose" /><span>{{
        busy
          ? percent < 100
            ? `上传中 ${percent}%`
            : '正在检查素材…'
          : modelValue
            ? '更换文件'
            : '选择文件'
      }}</span></label
    >
    <p class="help">
      {{
        kind === 'image'
          ? 'PNG / JPEG / WebP 静态图片，自动生成缩略图'
          : 'MP3 / M4A / WAV / AAC，上传一份完整对话音频'
      }}<br />最大 {{ Math.floor(limit / 1024 / 1024) }} MB
    </p>
    <p v-if="error" class="notice error" role="alert">
      {{ error }}
      <button v-if="selected" type="button" class="text" :disabled="busy" @click="send">
        重试上传
      </button>
    </p>
  </div>
</template>
<style scoped lang="scss">
.media-field {
  padding: 18px;
  border: 1px dashed #c5d2bf;
  border-radius: 8px;
  min-height: 170px;

  .field-title {
    font-weight: 600;
    margin-bottom: 14px;
  }

  .current {
    margin-bottom: 14px;

    img {
      width: 110px;
      height: 140px;
      object-fit: contain;
      background: var(--soft);
      border-radius: 6px;
    }

    audio {
      max-width: 100%;
      height: 38px;
    }
  }

  .upload-button {
    display: inline-flex;
    position: relative;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 7px 12px;
    cursor: pointer;
    background: var(--paper);

    input {
      position: absolute;
      opacity: 0;
      inset: 0;
      cursor: pointer;
    }
  }

  .help {
    font-size: 11px;
    color: var(--muted);
    margin-top: 10px;
    line-height: 1.8;
  }

  .notice {
    margin-top: 12px;
  }
}
</style>

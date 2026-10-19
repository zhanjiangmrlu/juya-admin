<script setup lang="ts">
import { ElImageViewer } from 'element-plus'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppUploadProgress from '@/components/app-upload-progress/app-upload-progress.vue'
import { mediaURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'
import { waitForMedia } from '@/services/media-processing'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { UploadProgress } from '@/shared/types/media'

import SceneAudio from './scene-audio.vue'
const props = defineProps<{ kind: 'image' | 'audio'; modelValue?: string | null; limit: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; busy: [value: boolean] }>()
const imageOpen = ref(false),
  busy = ref(false),
  percent = ref<number | null>(null),
  progress = ref<UploadProgress>({ loaded: 0, total: null, percent: null }),
  cancelled = ref(false),
  error = ref(''),
  metadata = ref<components['schemas']['MediaMetadata'] | null>(null),
  audio = ref<InstanceType<typeof SceneAudio> | null>(null)
const selected = ref<File | null>(null)
let key = '',
  alive = true,
  receiptUnknown = false,
  controller: AbortController | null = null
const accepted = ref<components['schemas']['MediaMetadata'] | null>(null)
const needsPlayback = computed(
  () =>
    props.kind === 'audio' &&
    metadata.value?.content_type?.startsWith('audio/') &&
    !metadata.value.playback_id
)
const accept = computed(() =>
  props.kind === 'image' ? '.jpg,.jpeg,.png,.webp' : '.mp3,.m4a,.wav,.aac'
)
/** 上传成功且处理完成才替换原素材，失败可复用原请求键 */
const send = async () => {
  if (!selected.value || busy.value) return
  busy.value = true
  emit('busy', true)
  error.value = ''
  percent.value = null
  progress.value = { loaded: 0, total: null, percent: null }
  cancelled.value = false
  controller = new AbortController()
  try {
    if (!accepted.value && receiptUnknown) {
      try {
        const receipt = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${key}`
        )
        accepted.value = receipt.result as components['schemas']['MediaMetadata']
        receiptUnknown = false
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
        receiptUnknown = false
      }
    }
    if (!accepted.value) {
      const form = new FormData()
      form.append('file', selected.value)
      accepted.value = await api.upload<components['schemas']['MediaMetadata']>(
        `/api/admin/v1/media?kind=${props.kind}`,
        form,
        key,
        (value) => {
          progress.value = value
          percent.value = value.percent
        },
        controller.signal
      )
    } else if (accepted.value.state === 'failed') {
      accepted.value = await api.request(`/api/admin/v1/media/${accepted.value.id}/retry`, {
        method: 'POST',
        key: crypto.randomUUID()
      })
    }
    const value = await waitForMedia(
      accepted.value!,
      async () => {
        const latest = await api.request<components['schemas']['MediaMetadata']>(
          `/api/admin/v1/media/${accepted.value!.id}/status`
        )
        if (alive) accepted.value = latest
        return latest
      },
      { active: () => alive && !cancelled.value }
    )
    if (!alive) return
    if (cancelled.value) throw new Error('已停止等待，接收的素材仍会处理，可继续查询')
    accepted.value = value
    if (value.state === 'failed') throw new Error(value.error || '素材处理失败，请重试或更换文件')
    if (value.state !== 'ready') throw new Error('素材仍在处理，可稍后继续查询')
    metadata.value = value
    emit('update:modelValue', value.id)
  } catch (reason) {
    if (
      !accepted.value &&
      (!(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        reason.code === 'response_unknown')
    )
      receiptUnknown = true
    if (alive) error.value = reason instanceof Error ? reason.message : '上传失败，请重试'
  } finally {
    if (alive) {
      busy.value = false
      emit('busy', false)
    }
  }
}
/** 处理历史音频的播放副本，保留原素材引用及已发布版本的可读性 */
const prepareLegacy = async () => {
  if (!props.modelValue || busy.value) return
  busy.value = true
  cancelled.value = false
  error.value = ''
  emit('busy', true)
  try {
    const id = props.modelValue
    const initial = await api.request<components['schemas']['MediaMetadata']>(
      `/api/admin/v1/media/${id}/retry`,
      {
        method: 'POST',
        key: crypto.randomUUID()
      }
    )
    accepted.value = initial
    metadata.value = initial
    const latest = await waitForMedia(
      initial,
      async () => {
        const value = await api.request<components['schemas']['MediaMetadata']>(
          `/api/admin/v1/media/${id}/status`
        )
        if (alive) {
          accepted.value = value
          metadata.value = value
        }
        return value
      },
      { active: () => alive && !cancelled.value }
    )
    if (!alive) return
    metadata.value = latest
    if (latest.state === 'failed') throw new Error(latest.error || '兼容处理失败，请重试')
    if (latest.state !== 'ready') throw new Error('音频仍在处理，可稍后继续查询')
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '兼容处理失败，请重试'
  } finally {
    if (alive) {
      busy.value = false
      emit('busy', false)
    }
  }
}
/** 停止本地传输或等待，保留原素材、接收编号与操作标识 */
const cancel = () => {
  cancelled.value = true
  controller?.abort()
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
  selected.value = file
  accepted.value = null
  receiptUnknown = false
  key = crypto.randomUUID()
  void send()
}
watch(
  () => props.modelValue,
  async (id) => {
    metadata.value = null
    if (id) {
      try {
        const value = await api.request<components['schemas']['MediaMetadata']>(
          `/api/admin/v1/media/${id}/status`
        )
        if (alive && props.modelValue === id) metadata.value = value
      } catch {
        if (alive && props.modelValue === id) metadata.value = null
      }
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  alive = false
  controller?.abort()
  audio.value?.stop()
})
</script>
<template>
  <div class="media-field" :class="kind">
    <p class="field-title">
      {{ kind === 'image' ? '场景图片' : '完整对话音频' }} <span class="required">*</span>
    </p>
    <div class="upload-card" :class="{ 'has-image': kind === 'image' && modelValue }">
      <strong v-if="kind === 'image'" class="upload-title">{{
        modelValue ? '场景图片已就绪' : '上传场景图片'
      }}</strong>
      <div v-if="modelValue" class="current">
        <button
          v-if="kind === 'image'"
          type="button"
          class="current-image"
          aria-label="查看场景原图"
          @click="imageOpen = true"
        >
          <img :src="mediaURL(modelValue)" alt="当前场景图" /></button
        ><SceneAudio v-else ref="audio" :media-id="modelValue" :metadata="metadata" />
        <p class="small muted">
          {{ metadata?.original_name || (kind === 'image' ? '场景图片' : '完整音频')
          }}<span v-if="metadata?.duration"> · {{ Math.round(metadata.duration) }} 秒</span>
        </p>
      </div>
      <div v-if="needsPlayback" class="notice">
        <p>历史音频需兼容处理后才能重新发布；处理期间已发布内容仍可访问。</p>
        <button
          type="button"
          data-action="prepare-legacy-audio"
          :disabled="busy"
          @click="prepareLegacy"
        >
          兼容处理／继续查询
        </button>
      </div>
      <p v-if="!modelValue && kind === 'audio'" class="small muted">未上传完整音频</p>
      <p v-if="selected" class="small">
        {{ selected.name }} · {{ (selected.size / 1024 / 1024).toFixed(2) }} MB{{
          busy && modelValue ? ' · 待替换，旧文件仍有效' : ''
        }}
      </p>
      <AppUploadProgress v-if="busy && !accepted" :progress="progress" />
      <p v-else-if="busy" role="status">
        {{
          accepted?.processing_stage === 'converting'
            ? '已上传，正在兼容处理为 MP3'
            : kind === 'audio'
              ? '上传完成，正在校验音频'
              : '上传完成，正在校验图片'
        }}
      </p>
      <label class="upload-button"
        ><input type="file" :accept="accept" :disabled="busy || !limit" @change="choose" /><span>{{
          busy && accepted
            ? '正在检查素材…'
            : busy
              ? percent === null || percent < 100
                ? percent === null
                  ? '正在上传'
                  : `上传中 ${percent}%`
                : '正在检查素材…'
              : modelValue
                ? kind === 'image'
                  ? '更换图片'
                  : '选择或更换音频'
                : kind === 'image'
                  ? '选择图片'
                  : '选择或更换音频'
        }}</span></label
      ><button
        v-if="kind === 'image' && modelValue"
        type="button"
        class="text small"
        @click="imageOpen = true"
      >
        查看大图
      </button>
      <p class="help">
        {{
          kind === 'image'
            ? 'PNG / JPEG / WebP 静态图片，自动生成缩略图'
            : 'MP3 / M4A / WAV / AAC，上传一份完整对话音频；原件保留并兼容处理为 MP3'
        }}<br />最大 {{ Math.floor(limit / 1024 / 1024) }} MB
      </p>
      <button
        v-if="busy"
        type="button"
        class="text small"
        data-action="cancel-upload"
        @click="cancel"
      >
        {{ percent === null || percent < 100 ? '取消本次上传' : '停止等待' }}
      </button>
      <p v-if="error" class="notice error" role="alert">
        {{ error }}
        <button
          v-if="selected"
          type="button"
          class="text"
          data-action="recover-upload"
          :disabled="busy"
          @click="send"
        >
          继续处理／查询
        </button>
      </p>
    </div>
    <ElImageViewer
      v-if="imageOpen && modelValue"
      :url-list="[mediaURL(modelValue)]"
      hide-on-click-modal
      teleported
      @close="imageOpen = false"
    />
  </div>
</template>
<style scoped lang="scss">
.media-field {
  min-width: 0;

  .field-title {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    line-height: 24px;
  }

  .required {
    color: var(--red);
  }

  .upload-card {
    position: relative;
    min-height: 160px;
    padding: 20px;
    border: 1px solid #b7cca7;
    border-radius: 10px;
    background: #fbfdf8;
  }

  &.audio .upload-card {
    min-height: 230px;
  }

  .has-image {
    padding-left: 134px;
  }

  .upload-title {
    display: block;
    font-size: 14px;
    margin: 7px 0;
    font-weight: 700;
  }

  .current {
    margin-bottom: 12px;

    > p {
      font-size: 13px;
      color: var(--muted);
    }
  }

  .current-image {
    position: absolute;
    left: 20px;
    top: 24px;
    width: 76px;
    height: 112px;
    padding: 0;
    border: 0;
    background: transparent;

    img {
      width: 76px;
      height: 112px;
      object-fit: contain;
      border-radius: 4px;
    }
  }

  .upload-button {
    display: inline-flex;
    align-items: center;
    position: relative;
    border: 1px solid var(--line);
    border-radius: 9px;
    min-height: 34px;
    padding: 5px 12px;
    cursor: pointer;
    background: var(--paper);
    font-size: 13px;
    margin-top: 8px;

    input {
      position: absolute;
      opacity: 0;
      inset: 0;
      cursor: pointer;
      width: 100%;
      min-height: 0;
    }
  }

  .help {
    font-size: 11px;
    color: var(--muted);
    margin-top: 12px;
    line-height: 1.8;
  }

  .notice {
    margin-top: 12px;
  }
}
</style>

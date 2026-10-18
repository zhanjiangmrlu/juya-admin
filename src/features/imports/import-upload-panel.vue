<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppUploadProgress from '@/components/app-upload-progress/app-upload-progress.vue'
import { useImportUploads } from '@/composables/use-import-uploads'
import { api } from '@/services/http-client'
import { importErrors } from '@/shared/constants/import'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch, ImportFile, ImportUpload } from '@/shared/types/import'
const props = defineProps<{
  batch: ImportBatch
  disabled?: boolean
  limits?: components['schemas']['UploadConfiguration'] | null
}>()
const emit = defineEmits<{
  refresh: []
  uploading: [value: boolean]
  pending: [value: number]
  changed: []
}>()
const error = ref(''),
  retrying = ref('')
const retryKeys = new Map<string, string>()
/** 读取当前环境的单文件上限
 * @param kind 文件在卡片中的用途
 * @returns 允许的最大字节数
 */
const limit = (kind: ImportUpload['kind']) => {
  const key =
    kind === 'image'
      ? 'image_limit_bytes'
      : kind === 'audio'
        ? 'audio_limit_bytes'
        : 'archive_limit_bytes'
  return props.limits?.[key] ?? Infinity
}
const { uploads, running, transferring, pendingCount, add, start, retryUpload, cancel, remove } =
  useImportUploads(
    () => props.batch.id,
    limit,
    () => emit('refresh')
  )
const serverFiles = computed(() =>
  props.batch.files.filter(
    (file) => !file.parent_id && !uploads.value.some((upload) => upload.accepted?.id === file.id)
  )
)
const fileStates = computed(() => {
  const known = new Set<string>()
  const states = uploads.value.map((upload) => {
    const accepted =
      props.batch.files.find((file) => file.id === upload.accepted?.id) || upload.accepted
    if (accepted) {
      known.add(accepted.id)
      return accepted.state === 'processing'
        ? 'processing'
        : accepted.state === 'failed'
          ? 'failed'
          : 'done'
    }
    return upload.busy
      ? 'uploading'
      : upload.unknown
        ? 'unknown'
        : upload.cancelled
          ? 'cancelled'
          : upload.error
            ? 'failed'
            : 'waiting'
  })
  for (const file of props.batch.files.filter((file) => !file.parent_id && !known.has(file.id)))
    states.push(
      file.state === 'processing' ? 'processing' : file.state === 'failed' ? 'failed' : 'done'
    )
  return states
})
/** 按同一接收对象去重统计文件状态
 * @param state 需要统计的真实阶段
 * @returns 当前阶段文件数量
 */
const countState = (state: string) => fileStates.value.filter((value) => value === state).length
/** 只接收拖放的文件，不增加文件夹直传入口
 * @param event 管理员拖放文件事件
 */
const drop = (event: DragEvent) => {
  if (props.disabled || props.batch.mode !== 'zip') return
  add([...(event.dataTransfer?.files || [])], 'zip')
  emit('changed')
}
watch(transferring, (value) => emit('uploading', value))
watch(pendingCount, (value) => emit('pending', value), { immediate: true })
/** 选择资料先展示待上传清单，ZIP等待管理员明确开始
 * @param event 本地文件选择事件
 * @param kind 本次选择的资料用途
 */
const choose = (event: Event, kind: ImportUpload['kind']) => {
  const input = event.target as HTMLInputElement
  add([...(input.files || [])], kind)
  input.value = ''
  emit('changed')
  if (kind !== 'zip') void start()
}
/** 显示管理员可读的文件大小
 * @param size 原始文件字节数
 * @returns 带单位的大小
 */
const sizeText = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`
/** 汇总单ZIP及其素材任务的实际状态
 * @param file 最新的源文件状态
 * @returns 文件夹读取、素材检查或失败说明
 */
const statusText = (file: ImportFile | null) => {
  if (!file) return '等待接收'
  if (file.state === 'failed')
    return importErrors[file.error_code || ''] || '处理失败，请修正或重试'
  const progress = file.progress
  if (file.state === 'processing')
    return progress?.total
      ? `正在解析 ${progress.processed}/${progress.total} 个卡片文件夹`
      : '等待或正在读取资料'
  const children = props.batch.files.filter((value) => value.parent_id === file.id)
  const media = children.filter((value) => ['image', 'audio'].includes(value.kind))
  if (media.some((value) => value.state === 'processing'))
    return `检查素材 ${media.filter((value) => value.state !== 'processing').length}/${media.length}`
  const failed =
    children.some((value) => value.state === 'failed') ||
    props.batch.items.some(
      (item) => children.some((value) => value.id === item.source_file_id) && !item.readable
    )
  return `${progress?.total ? `已读取 ${progress.total} 个卡片文件夹` : '已读取'}${failed ? '（部分失败）' : ''}`
}
/** 重试服务器保留的失败文件，不重传其余成功资料
 * @param file 已接收且失败的文件
 */
const retry = async (file: ImportFile) => {
  if (retrying.value) return
  retrying.value = file.id
  error.value = ''
  const key = retryKeys.get(file.id) || crypto.randomUUID()
  retryKeys.set(file.id, key)
  try {
    await api.request(`/api/admin/v1/imports/${props.batch.id}/files/${file.id}/retry`, {
      method: 'POST',
      key
    })
    retryKeys.delete(file.id)
    emit('refresh')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '暂未确认重试结果'
  } finally {
    retrying.value = ''
  }
}
/** 显示来自最新批次的真实处理状态
 * @param upload 当前上传记录
 * @returns 已接收文件的最新状态
 */
const acceptedFile = (upload: ImportUpload) =>
  props.batch.files.find((file) => file.id === upload.accepted?.id) || upload.accepted
</script>
<template>
  <section class="panel import-upload">
    <h2>上传{{ batch.mode === 'zip' ? 'ZIP资料包' : 'DOCX及配套资料' }}</h2>
    <p class="muted small">
      每张卡片需要名称、场景图、完整音频、中英文对话和词汇；语块选填。文件限额由当前环境校验。
    </p>
    <p class="muted small">完整音频支持 MP3 / M4A / WAV / AAC，上传后会检查音频并识别实际时长。</p>
    <p v-if="batch.mode === 'zip' && limits" class="small muted">
      单ZIP最多 {{ sizeText(limits.archive_limit_bytes) }}，每批最多
      {{ limits.import_card_limit }} 张卡片。
    </p>
    <div
      v-if="batch.mode === 'zip'"
      class="zip-drop"
      data-action="zip-drop"
      @dragover.prevent
      @drop.prevent="drop"
    >
      可将多个ZIP拖到此处，或点击下方选择；一张卡片一个文件夹。
    </div>
    <p class="small" role="status">
      总文件 {{ fileStates.length }} · 等待 {{ countState('waiting') }} · 上传中
      {{ countState('uploading') }} · 校验／解析 {{ countState('processing') }} · 完成
      {{ countState('done') }} · 失败 {{ countState('failed') }} · 取消
      {{ countState('cancelled') }} · 接收待确认 {{ countState('unknown') }}
    </p>
    <div class="row file-actions">
      <label v-if="batch.mode === 'zip'" class="button-link"
        >选择ZIP（可多选）<input
          multiple
          type="file"
          accept=".zip"
          :disabled="disabled"
          @change="choose($event, 'zip')"
      /></label>
      <template v-else>
        <label class="button-link"
          >选择DOCX<input
            type="file"
            multiple
            accept=".docx"
            :disabled="disabled"
            @change="choose($event, 'docx')"
        /></label>
        <label class="button-link"
          >选择场景图片<input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            :disabled="disabled"
            @change="choose($event, 'image')"
        /></label>
        <label class="button-link"
          >选择完整音频<input
            type="file"
            multiple
            accept=".mp3,.m4a,.wav,.aac"
            :disabled="disabled"
            @change="choose($event, 'audio')"
        /></label>
      </template>
    </div>
    <p v-if="batch.mode === 'zip'" class="small muted">
      一张卡片一个文件夹，每个文件夹一份内容DOCX、一张图和一份完整音频。
    </p>
    <p v-else class="small muted">
      DOCX可有多个一级标题；只有明确同名的图片及音频会形成对应候选，仍需下一步核对。
    </p>
    <div v-if="batch.mode === 'zip' && pendingCount" class="row queue-actions">
      <span class="small">待上传或待确认 {{ pendingCount }} 个ZIP</span>
      <button
        type="button"
        class="primary"
        data-action="start-upload"
        :disabled="disabled || running || !uploads.some((item) => item.queued)"
        @click="start"
      >
        {{ running ? '正在上传…' : '开始上传' }}
      </button>
    </div>
    <ul class="file-list">
      <li v-for="upload in uploads" :key="upload.id">
        <span
          >{{ upload.file.name
          }}<small class="muted"> · {{ sizeText(upload.file.size) }}</small></span
        >
        <span v-if="upload.queued">待上传</span>
        <AppUploadProgress v-else-if="upload.busy" :progress="upload.progress" />
        <span v-else-if="upload.cancelled && !upload.accepted && !upload.unknown"
          >已取消，重新添加才会再次上传</span
        >
        <span v-else-if="upload.error" class="error">{{ upload.error }}</span>
        <span v-else>{{ statusText(acceptedFile(upload)) }}</span>
        <button
          v-if="!upload.busy && !upload.accepted && !upload.unknown"
          type="button"
          class="text"
          data-action="remove-upload"
          @click="remove(upload)"
        >
          移除
        </button>
        <button v-if="upload.busy" type="button" class="text" @click="cancel(upload.id)">
          取消本次上传
        </button>
        <button
          v-else-if="upload.error && !upload.invalid && (!upload.cancelled || upload.unknown)"
          type="button"
          class="text"
          data-action="retry-upload"
          :disabled="disabled || running"
          @click="retryUpload(upload)"
        >
          {{ upload.unknown ? '查询／重试本文件' : '重试本文件' }}
        </button>
        <button
          v-else-if="acceptedFile(upload)?.state === 'failed'"
          type="button"
          class="text"
          :disabled="!!retrying"
          @click="retry(acceptedFile(upload)!)"
        >
          重试处理
        </button>
      </li>
      <li v-for="file in serverFiles" :key="file.id">
        <span
          >{{ file.name }}<small class="muted"> · {{ sizeText(file.size) }}</small></span
        >
        <span>{{ statusText(file) }}</span>
        <button
          v-if="file.state === 'failed'"
          type="button"
          class="text"
          :disabled="!!retrying"
          @click="retry(file)"
        >
          重试处理
        </button>
      </li>
    </ul>
    <p v-if="batch.files.some((file) => file.state === 'failed' && !file.parent_id)" class="notice">
      失败包不计入本次核对；其他可读取卡片可以继续。
    </p>
    <details v-if="batch.unused_file_ids.length" class="panel">
      <summary>未使用文件 {{ batch.unused_file_ids.length }} 份</summary>
      <p v-for="id in batch.unused_file_ids" :key="id">
        {{ batch.files.find((file) => file.id === id)?.name || '未使用资料' }}
      </p>
    </details>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div
      v-for="file in batch.files.filter((item) => item.parent_id && item.state === 'failed')"
      :key="file.id"
      class="notice error"
      role="alert"
    >
      <strong
        >{{ batch.files.find((value) => value.id === file.parent_id)?.name }} /
        {{ file.name }}</strong
      >
      <p>
        {{
          importErrors[file.error_code || ''] || '此素材处理失败，可重试或更换文件；其他资料保留'
        }}
      </p>
      <button
        v-if="
          ![
            'archive_member_limit',
            'archive_member_invalid',
            'image_invalid',
            'audio_invalid'
          ].includes(file.error_code || '')
        "
        type="button"
        class="text"
        :disabled="!!retrying"
        @click="retry(file)"
      >
        重试此文件处理
      </button>
    </div>
    <details v-if="batch.unused_file_ids.length">
      <summary>未使用文件（{{ batch.unused_file_ids.length }}）</summary>
      <p
        v-for="file in batch.files.filter((item) => batch.unused_file_ids.includes(item.id))"
        :key="file.id"
        class="small muted"
      >
        {{ file.name }} · 未绑定到卡片
      </p>
    </details>
  </section>
</template>
<style scoped lang="scss">
.zip-drop {
  padding: 18px;
  margin: 14px 0;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--soft);
}

.import-upload {
  h2 {
    margin-bottom: 16px;
  }

  p {
    line-height: 1.8;
  }
}

.file-actions {
  margin: 22px 0 14px;

  label {
    position: relative;
    cursor: pointer;

    input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
  }
}

.file-list {
  list-style: none;
  padding: 0;
  margin-top: 22px;

  li {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    font-size: 12px;

    > span:first-child {
      flex: 1;
      overflow-wrap: anywhere;
    }
  }
}

details {
  margin-top: 18px;

  summary {
    cursor: pointer;
  }
}
</style>

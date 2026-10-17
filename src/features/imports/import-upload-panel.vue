<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { api, ApiError } from '@/services/http-client'
import { importErrors } from '@/shared/constants/import'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch, ImportFile, ImportUpload } from '@/shared/types/import'
const props = defineProps<{ batch: ImportBatch; disabled?: boolean }>()
const emit = defineEmits<{ refresh: []; uploading: [value: boolean] }>()
const uploads = ref<ImportUpload[]>([]),
  error = ref(''),
  retrying = ref('')
const controllers = new Map<string, AbortController>()
const retryKeys = new Map<string, string>()
const serverFiles = computed(() =>
  props.batch.files.filter(
    (file) => !file.parent_id && !uploads.value.some((upload) => upload.accepted?.id === file.id)
  )
)
const transferring = computed(() => uploads.value.some((upload) => upload.busy))
let alive = true
/** 查询或传输同一文件，原响应未知时先查询接收凭证
 * @param upload 当前文件的稳定上传记录
 */
const send = async (upload: ImportUpload) => {
  if (upload.busy) return
  upload.busy = true
  upload.error = ''
  emit('uploading', true)
  const controller = new AbortController()
  controllers.set(upload.id, controller)
  try {
    if (upload.unknown) {
      try {
        const receipt = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${upload.key}`
        )
        upload.accepted = receipt.result as ImportFile
        upload.unknown = false
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
      }
    }
    if (controller.signal.aborted)
      throw new ApiError('upload_unknown', '传输已取消，可查询接收结果')
    if (!upload.accepted) {
      const form = new FormData()
      form.append('file', upload.file)
      upload.accepted = await api.upload<ImportFile>(
        `/api/admin/v1/imports/${props.batch.id}/files?kind=${upload.kind}`,
        form,
        upload.key,
        (value) => {
          upload.percent = value
        },
        controller.signal
      )
      upload.unknown = false
    }
    if (alive) emit('refresh')
  } catch (reason) {
    upload.unknown =
      !(reason instanceof ApiError) ||
      !reason.status ||
      reason.status >= 500 ||
      reason.code === 'response_unknown'
    if (alive) upload.error = reason instanceof Error ? reason.message : '上传失败，请重试本文件'
  } finally {
    controllers.delete(upload.id)
    upload.busy = false
    if (alive) emit('uploading', transferring.value)
  }
}
/** 选择明确类型的文件，成功文件不随失败文件重传
 * @param event 文件输入框变更
 * @param kind 管理员选择的资料用途
 */
const choose = async (event: Event, kind: ImportUpload['kind']) => {
  const input = event.target as HTMLInputElement,
    files = [...(input.files || [])]
  input.value = ''
  for (const file of files) {
    const upload: ImportUpload = {
      id: crypto.randomUUID(),
      file,
      kind,
      key: crypto.randomUUID(),
      percent: 0,
      busy: false,
      error: '',
      unknown: false,
      accepted: null
    }
    uploads.value.push(upload)
    await send(uploads.value.at(-1)!)
    if (!alive) return
  }
}
/** 取消客户端传输，不删除已接受文件
 * @param id 本地上传记录编号
 */
const cancel = (id: string) => {
  controllers.get(id)?.abort()
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
    if (alive) emit('refresh')
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '暂未确认重试结果'
  } finally {
    if (alive) retrying.value = ''
  }
}
/** 显示来自最新批次的真实处理状态
 * @param upload 当前上传记录
 * @returns 已接收文件的最新状态
 */
const acceptedFile = (upload: ImportUpload) =>
  props.batch.files.find((file) => file.id === upload.accepted?.id) || upload.accepted
onBeforeUnmount(() => {
  alive = false
  for (const controller of controllers.values()) controller.abort()
})
</script>
<template>
  <section class="panel import-upload">
    <h2>上传{{ batch.mode === 'zip' ? 'ZIP资料包' : 'DOCX及配套资料' }}</h2>
    <p class="muted small">
      每张卡片需要名称、场景图、完整音频、中英文对话和词汇；语块选填。文件限额由当前环境校验。
    </p>
    <p class="muted small">完整音频支持 MP3 / M4A / WAV / AAC，上传后会检查音频并识别实际时长。</p>
    <div class="row file-actions">
      <label v-if="batch.mode === 'zip'" class="button-link"
        >选择ZIP<input
          type="file"
          accept=".zip"
          :disabled="disabled || transferring"
          @change="choose($event, 'zip')"
      /></label>
      <template v-else>
        <label class="button-link"
          >选择DOCX<input
            type="file"
            multiple
            accept=".docx"
            :disabled="disabled || transferring"
            @change="choose($event, 'docx')"
        /></label>
        <label class="button-link"
          >选择场景图片<input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            :disabled="disabled || transferring"
            @change="choose($event, 'image')"
        /></label>
        <label class="button-link"
          >选择完整音频<input
            type="file"
            multiple
            accept=".mp3,.m4a,.wav,.aac"
            :disabled="disabled || transferring"
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
    <ul class="file-list">
      <li v-for="upload in uploads" :key="upload.id">
        <span>{{ upload.file.name }}</span>
        <span v-if="upload.busy">上传中 {{ upload.percent }}%</span>
        <span v-else-if="upload.error" class="error">{{ upload.error }}</span>
        <span v-else>{{
          acceptedFile(upload)?.state === 'ready'
            ? '已读取'
            : acceptedFile(upload)?.state === 'failed'
              ? importErrors[acceptedFile(upload)?.error_code || ''] || '处理失败，请修正或重试'
              : '正在读取资料'
        }}</span>
        <button v-if="upload.busy" type="button" class="text" @click="cancel(upload.id)">
          取消本次上传
        </button>
        <button v-else-if="upload.error" type="button" class="text" @click="send(upload)">
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
        <span>{{ file.name }}</span
        ><span>{{
          file.state === 'ready'
            ? '已读取'
            : file.state === 'failed'
              ? importErrors[file.error_code || ''] || '处理失败，请修正或重试'
              : '正在读取资料'
        }}</span>
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
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div
      v-for="file in batch.files.filter((item) => item.parent_id && item.state === 'failed')"
      :key="file.id"
      class="notice error"
      role="alert"
    >
      <strong>{{ file.name }}</strong>
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

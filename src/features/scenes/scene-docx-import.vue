<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import AppUploadProgress from '@/components/app-upload-progress/app-upload-progress.vue'
import SceneReader from '@/features/scenes/scene-reader.vue'
import { api, ApiError } from '@/services/http-client'
import { importErrors } from '@/shared/constants/import'

import type { SceneContent } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch, ImportFile } from '@/shared/types/import'
import type { UploadProgress } from '@/shared/types/media'
const props = defineProps<{ content: SceneContent; disabled?: boolean }>()
const emit = defineEmits<{ apply: [content: SceneContent]; busy: [value: boolean] }>()
const candidate = ref<SceneContent | null>(null),
  open = ref(false),
  busy = ref(false),
  progress = ref<UploadProgress>({ loaded: 0, total: null, percent: null }),
  error = ref(''),
  selectedName = ref('')
let file: File | null = null,
  createKey = '',
  uploadKey = '',
  batchId = '',
  accepted: ImportFile | null = null,
  unknownCreate = false,
  unknownUpload = false,
  alive = true,
  cancelled = false,
  controller: AbortController | null = null
/** 查询或继续同一文件，单卡模式不提前创建正式卡片 */
const read = async () => {
  if (!file || busy.value) return
  busy.value = true
  cancelled = false
  error.value = ''
  emit('busy', true)
  controller = new AbortController()
  try {
    if (!batchId) {
      let created: ImportBatch | null = null
      if (unknownCreate) {
        try {
          const value = await api.request<components['schemas']['OperationResponse']>(
            `/api/admin/v1/operations/${createKey}`
          )
          created = value.result as ImportBatch
        } catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
        }
      }
      unknownCreate = true
      created ||= await api.request<ImportBatch>('/api/admin/v1/imports', {
        method: 'POST',
        body: { mode: 'docx', single_card: true },
        key: createKey
      })
      batchId = created.id
      unknownCreate = false
    }
    if (!accepted && unknownUpload) {
      try {
        const value = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${uploadKey}`
        )
        accepted = value.result as ImportFile
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
      }
    }
    if (cancelled) throw new Error('已停止等待，可继续查询本文件')
    if (!accepted) {
      const form = new FormData()
      form.append('file', file)
      unknownUpload = true
      accepted = await api.upload<ImportFile>(
        `/api/admin/v1/imports/${batchId}/files?kind=docx`,
        form,
        uploadKey,
        (value) => {
          progress.value = value
        },
        controller.signal
      )
      unknownUpload = false
    }
    for (let count = 0; count < 20 && alive && !cancelled; count++) {
      const value = await api.request<ImportBatch>(`/api/admin/v1/imports/${batchId}`)
      if (!alive || cancelled) return
      const source = value.files.find((entry) => entry.id === accepted?.id)
      if (source?.state === 'failed')
        throw new Error(
          importErrors[source.error_code || ''] || '资料读取失败，请修正后重新选择文件'
        )
      if (source?.state === 'ready') {
        if (value.items.length !== 1 || !value.items[0]?.readable)
          throw new Error('单卡DOCX必须恰好一张卡片，多卡请改用批量导入')
        const content = value.items[0].content
        candidate.value = {
          ...content,
          dialogue: content.dialogue || [],
          vocabulary: content.vocabulary || [],
          chunks: content.chunks || []
        }
        open.value = true
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (alive) error.value = '资料仍在读取，可继续查询；本次读取不会覆盖当前输入'
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '读取结果待确认，请继续查询'
  } finally {
    if (alive) {
      busy.value = false
      emit('busy', false)
    }
  }
}
/** 每次明确选择新文件建立独立的核对暂存
 * @param event DOCX文件选择事件
 */
const choose = (event: Event) => {
  const input = event.target as HTMLInputElement,
    chosen = input.files?.[0]
  input.value = ''
  if (!chosen) return
  file = chosen
  selectedName.value = chosen.name
  createKey = crypto.randomUUID()
  uploadKey = crypto.randomUUID()
  batchId = ''
  accepted = null
  unknownCreate = unknownUpload = false
  candidate.value = null
  progress.value = { loaded: 0, total: null, percent: null }
  void read()
}
/** 停止客户端等待，保留已接收文件供继续查询 */
const cancel = () => {
  cancelled = true
  controller?.abort()
  error.value = '已停止等待，可继续查询本文件；当前输入未被替换'
}
/** 明确确认后仅替换三组文本，保留此刻的手工名称和素材 */
const apply = () => {
  if (!candidate.value) return
  emit('apply', {
    ...props.content,
    dialogue: candidate.value.dialogue,
    vocabulary: candidate.value.vocabulary,
    chunks: candidate.value.chunks
  })
  open.value = false
}
onBeforeUnmount(() => {
  alive = false
  controller?.abort()
})
</script>
<template>
  <section class="panel docx-import">
    <div class="between">
      <div>
        <h2>从DOCX读取文本</h2>
        <p class="small muted">
          只生成对话、词汇和语块候选；确认替换后仍需保存草稿。名称、图片和音频保留。
        </p>
      </div>
      <label class="button-link"
        >{{ busy ? '正在处理资料…' : '选择单卡DOCX'
        }}<input type="file" accept=".docx" :disabled="disabled || busy" @change="choose"
      /></label>
    </div>
    <p v-if="selectedName" class="small muted">
      {{ selectedName }}
      <button v-if="busy" type="button" class="text" @click="cancel">取消／停止等待</button>
    </p>
    <AppUploadProgress v-if="busy && !accepted" :progress="progress" />
    <p v-else-if="busy" role="status">上传完成，正在读取资料</p>
    <p v-if="error" class="notice error" role="alert">
      {{ error
      }}<button type="button" class="text" :disabled="busy || disabled" @click="read">
        继续查询本文件
      </button>
    </p>
    <ElDialog
      v-if="candidate"
      v-model="open"
      title="核对DOCX文本替换"
      width="min(1000px,95vw)"
      :close-on-click-modal="false"
      ><p class="notice">
        将替换当前对话{{ content.dialogue.length }}组→{{ candidate.dialogue.length }}组、词汇{{
          content.vocabulary.length
        }}个→{{ candidate.vocabulary.length }}个、语块{{ content.chunks.length }}个→{{
          candidate.chunks.length
        }}个。手工名称和素材保留。
      </p>
      <div class="docx-comparison">
        <section>
          <h3>当前编辑内容</h3>
          <SceneReader :content="content" />
        </section>
        <section>
          <h3>DOCX读取候选：{{ candidate.name }}</h3>
          <SceneReader :content="candidate" />
        </section>
      </div>
      <template #footer
        ><button type="button" @click="open = false">保留当前输入</button
        ><button
          type="button"
          class="primary"
          data-action="confirm-docx"
          :disabled="disabled"
          @click="apply"
        >
          确认替换对话、词汇及语块
        </button></template
      ></ElDialog
    >
  </section>
</template>
<style scoped lang="scss">
.docx-import {
  p {
    margin-top: 12px;
    line-height: 1.8;
  }

  label {
    position: relative;

    input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
  }
}

.docx-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  max-height: 55vh;
  overflow: auto;

  h3 {
    font-size: 13px;
    padding: 14px;
    background: var(--soft);
  }
}
</style>

<script setup lang="ts">
import { ElButton, ElRadio, ElRadioGroup, ElTag } from 'element-plus'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppUploadProgress from '@/components/app-upload-progress/app-upload-progress.vue'
import { api, ApiError } from '@/services/http-client'
import { waitForMedia } from '@/services/media-processing'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { UploadProgress } from '@/shared/types/media'

import StudyNoteViewer from './study-note-viewer.vue'

type Media = components['schemas']['MediaMetadata']
type Change = components['schemas']['StudyNoteChange']
type SelectionSnapshot = {
  decision: Change
  media: Media | null
  effective: Media | null
  file: File | null
  key: string
  unknown: boolean
  rejection: string
  previous: SelectionSnapshot | null
}
const props = defineProps<{
  draft?: components['schemas']['StudyNoteDraft'] | null
  modelValue?: Change | null
  limit: number
  source?: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: Change]
  transfer: [value: boolean]
  blocked: [value: boolean]
}>()
const selected = ref<File | null>(null),
  accepted = ref<Media | null>(null),
  error = ref(''),
  rejection = ref(''),
  busy = ref(false),
  transferring = ref(false),
  viewId = ref(''),
  localAction = ref<Change | null>(null)
const progress = ref<UploadProgress>({ loaded: 0, total: null, percent: null })
let previous: SelectionSnapshot | null = null
let generation = 0,
  alive = true,
  key = '',
  unknown = false,
  controller: AbortController | null = null
const decision = computed(
  () =>
    localAction.value ||
    props.modelValue || {
      action: props.draft?.action || 'keep',
      ...(props.draft?.action === 'set'
        ? { media_id: (props.draft.pending_attachment || props.draft.attachment)?.id }
        : {})
    }
)
const pending = computed(
  () => accepted.value || (decision.value.action === 'set' ? props.draft?.pending_attachment : null)
)
const effective = computed(() =>
  decision.value.action === 'remove'
    ? null
    : pending.value?.state === 'ready'
      ? pending.value
      : previous?.effective || props.draft?.attachment
)
const blocked = computed(
  () =>
    transferring.value ||
    decision.value.action === 'unresolved' ||
    (!!selected.value && !pending.value) ||
    (decision.value.action === 'set' &&
      (pending.value ? pending.value.state !== 'ready' : !props.draft?.can_publish))
)
const radio = computed(() =>
  decision.value.action === 'remove'
    ? 'remove'
    : decision.value.action === 'set'
      ? decision.value.media_id || ''
      : ''
)
watch(blocked, (value) => emit('blocked', value), { immediate: true })
watch(transferring, (value) => emit('transfer', value))
/** 更新明确附件决策，保留独立于正文的草稿动作
 * @param value 当前管理员确认的附件操作
 */
const change = (value: Change) => {
  const fallback = previous?.effective
  const decision =
    fallback?.state === 'ready' &&
    fallback.id !== props.draft?.attachment?.id &&
    fallback.id !== value.media_id &&
    ['set', 'unresolved'].includes(value.action)
      ? { ...value, previous_media_id: fallback.id }
      : value
  localAction.value = decision
  emit('update:modelValue', decision)
}
/** 保存本次更换之前的候选，取消时恢复该候选而非发布前旧件 */
const remember = () => {
  previous = {
    decision: { ...decision.value },
    media: accepted.value,
    effective: effective.value || null,
    file: selected.value,
    key,
    unknown,
    rejection: rejection.value,
    previous
  }
}
/** 终止本轮传输与轮询，使迟到回执失效 */
const stop = () => {
  generation++
  controller?.abort()
  busy.value = false
  transferring.value = false
  error.value = ''
  rejection.value = ''
  unknown = false
}
/** 查询已接收的PDF，取消后的迟到状态不得重新关联
 * @param media 已接收的PDF快照
 * @param token 当前选择轮次
 */
const poll = async (media: Media, token: number) => {
  try {
    const latest = await waitForMedia(
      media,
      async () => {
        const value = await api.request<Media>(`/api/admin/v1/media/${media.id}/status`)
        if (alive && token === generation) accepted.value = value
        return value
      },
      { active: () => alive && token === generation }
    )
    if (!alive || token !== generation) return
    accepted.value = latest
    if (latest.state === 'failed') error.value = latest.error || 'PDF校验失败，请替换或取消'
    else if (latest.state !== 'ready') error.value = 'PDF仍在校验，可保存草稿后继续查询'
  } catch (reason) {
    if (alive && token === generation)
      error.value = reason instanceof Error ? reason.message : 'PDF状态查询失败，可继续查询'
  }
}
/** 复用同一上传键恢复未知收据，收到编号即可保存待处理草稿 */
const send = async () => {
  if (busy.value || rejection.value || (!selected.value && !accepted.value)) return
  const token = generation
  busy.value = true
  error.value = ''
  controller = new AbortController()
  try {
    if (!accepted.value && unknown) {
      try {
        const receipt = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${key}`
        )
        if (token !== generation) return
        accepted.value = receipt.result as Media
        unknown = false
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
        if (token !== generation || !alive) return
        unknown = false
      }
    }
    if (token !== generation || !alive) return
    if (!accepted.value) {
      transferring.value = true
      const form = new FormData()
      form.append('file', selected.value!)
      const media = await api.upload<Media>(
        '/api/admin/v1/media?kind=study_note',
        form,
        key,
        (value) => {
          if (token === generation) progress.value = value
        },
        controller.signal
      )
      if (token !== generation || !alive) return
      accepted.value = media
    } else if (accepted.value.state === 'failed') {
      const media = await api.request<Media>(`/api/admin/v1/media/${accepted.value.id}/retry`, {
        method: 'POST',
        key: crypto.randomUUID()
      })
      if (token !== generation || !alive) return
      accepted.value = media
    }
    transferring.value = false
    change({ action: 'set', media_id: accepted.value!.id })
    await poll(accepted.value!, token)
  } catch (reason) {
    if (token !== generation || !alive) return
    unknown =
      !accepted.value &&
      (!(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        reason.code === 'response_unknown')
    if (!accepted.value) change({ action: 'unresolved' })
    error.value = reason instanceof Error ? reason.message : 'PDF上传失败，请重试'
  } finally {
    if (token === generation && alive) {
      busy.value = false
      transferring.value = false
    }
  }
}
/** 取消本次更换并使所有迟到响应失效，保留原有效PDF */
const cancel = () => {
  stop()
  const restore = previous
  accepted.value = restore?.media || null
  selected.value = restore?.file || null
  previous = restore?.previous || null
  if (restore) {
    key = restore.key
    unknown = restore.unknown
    rejection.value = restore.rejection
  }
  change(restore?.decision || { action: 'keep' })
}
/** 明确移除附件，发布成功后才影响用户 */
const remove = () => {
  stop()
  previous = null
  accepted.value = null
  selected.value = null
  change({ action: 'remove' })
}
/** 选择包内候选或明确不添加
 * @param value 管理员所选媒体编号或移除标记
 */
const selectCandidate = (value: string | number | boolean | undefined) => {
  if (value === 'remove') {
    remove()
    return
  }
  remember()
  stop()
  const candidate = props.draft?.candidates?.find((item) => item.media_id === value)
  if (!candidate?.media_id) return
  selected.value = null
  accepted.value = {
    id: candidate.media_id,
    state: candidate.state,
    original_name: candidate.name,
    size: candidate.size,
    error: candidate.error,
    error_code: candidate.error_code
  } as Media
  change({ action: 'set', media_id: candidate.media_id })
  if (candidate.state !== 'ready' && candidate.state !== 'failed')
    void poll(accepted.value, generation)
}
/** 校验本地文件基本条件，真实格式与可读性由服务端确认
 * @param event PDF文件选择事件
 */
const choose = (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  remember()
  stop()
  accepted.value = null
  selected.value = file
  if (!file.size) rejection.value = '文件为空，请重新选择'
  else if (file.size > props.limit)
    rejection.value = `文件超过大小限制（${(props.limit / 1024 / 1024).toFixed(2)} MB），请压缩或更换文件`
  else if (!file.name.toLowerCase().endsWith('.pdf'))
    rejection.value = '文件后缀须为PDF，请重新选择'
  if (rejection.value) {
    change({ action: 'unresolved' })
    return
  }
  key = crypto.randomUUID()
  unknown = false
  progress.value = { loaded: 0, total: null, percent: null }
  void send()
}
watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value) === JSON.stringify(localAction.value)) return
    previous = null
    generation++
    controller?.abort()
    accepted.value = null
    selected.value = null
    localAction.value = null
    rejection.value = ''
    busy.value = false
    transferring.value = false
    error.value = ''
  }
)
watch(
  () => props.draft?.pending_attachment,
  (media) => {
    if (localAction.value || selected.value) return
    if (accepted.value?.id === media?.id && accepted.value?.state === media?.state) return
    stop()
    accepted.value = media || null
    if (media && media.state !== 'ready' && media.state !== 'failed') void poll(media, generation)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  alive = false
  generation++
  controller?.abort()
})
</script>
<template>
  <section class="panel study-note">
    <div class="row">
      <h2>学习笔记PDF</h2>
      <ElTag type="info" effect="plain">选填</ElTag>
    </div>
    <p class="muted small">为这张场景卡补充一份PDF学习笔记，用户可在详情页查看。</p>
    <p v-if="source" class="source small">来源：{{ source }}</p>
    <div v-if="effective" class="file-card">
      <span class="pdf-badge" aria-hidden="true">PDF</span
      ><strong>{{ effective.original_name }}</strong
      ><span>{{ ((effective.size || 0) / 1024 / 1024).toFixed(2) }} MB · 可用</span>
      <ElButton link @click="viewId = effective.id">查看PDF</ElButton>
      <ElButton link :disabled="disabled" data-action="remove-study-note" @click="remove"
        >移除</ElButton
      >
    </div>
    <p v-else class="small">
      {{ decision.action === 'remove' ? '已明确不添加／移除，发布后生效' : '尚未添加学习笔记' }}
    </p>
    <div v-if="draft?.candidates?.length" class="candidates">
      <p>
        同一来源目录的PDF：{{
          draft.candidates.length > 1 ? '请选择一份或不添加' : '已自动匹配唯一PDF，可更换或不添加'
        }}
      </p>
      <ElRadioGroup
        :model-value="radio"
        :disabled="disabled || transferring"
        @update:model-value="selectCandidate"
      >
        <ElRadio
          v-for="candidate in draft.candidates"
          :key="candidate.file_id"
          :value="candidate.media_id || candidate.file_id"
          :disabled="!candidate.media_id"
        >
          {{ candidate.name }} · {{ (candidate.size / 1024 / 1024).toFixed(2) }} MB ·
          {{
            candidate.state === 'ready'
              ? '可用'
              : candidate.state === 'failed'
                ? candidate.error ||
                  (candidate.error_code === 'study_note_invalid'
                    ? 'PDF损坏、格式无效或无法解密，请替换或不添加'
                    : `校验失败（${candidate.error_code || '文件不可用'}），请替换或不添加`)
                : '校验中'
          }} </ElRadio
        ><ElRadio value="remove">不添加学习笔记／移除原笔记</ElRadio>
      </ElRadioGroup>
    </div>
    <p v-if="!rejection && (selected || pending)" class="small">
      待处理：{{ selected?.name || pending?.original_name }} ·
      {{
        pending?.state === 'ready'
          ? '校验通过，待发布'
          : pending?.state === 'failed'
            ? '校验失败，原有效文件保留'
            : '正在校验，上传100%不代表可用'
      }}
    </p>
    <AppUploadProgress v-if="transferring" :progress="progress" />
    <p
      v-if="rejection || error || (pending?.state === 'failed' && pending.error)"
      class="notice error"
      role="alert"
    >
      {{ rejection ? `${selected?.name}：${rejection}` : error || pending?.error }}
    </p>
    <div class="row tools">
      <label
        ><ElButton :disabled="disabled || transferring || !limit">{{
          effective ? '替换PDF' : '选择PDF'
        }}</ElButton
        ><input
          aria-label="选择学习笔记PDF"
          type="file"
          accept=".pdf,application/pdf"
          :disabled="disabled || transferring || !limit"
          @change="choose"
      /></label>
      <ElButton
        v-if="!rejection && (selected || pending)"
        :disabled="disabled || busy"
        @click="send"
        >重试／继续查询</ElButton
      >
      <ElButton
        v-if="selected || pending || decision.action === 'unresolved'"
        data-action="cancel-study-note"
        :disabled="disabled"
        @click="cancel"
        >取消本次更换／保留原笔记</ElButton
      >
      <ElButton
        v-if="!effective && decision.action !== 'remove'"
        :disabled="disabled"
        @click="remove"
        >不添加学习笔记</ElButton
      >
    </div>
    <p class="help">
      仅支持PDF，最大
      {{ (limit / 1024 / 1024).toFixed(2) }}
      MB；草稿可保留待处理附件，发布前须校验完成或明确取消。替换、移除在发布成功后生效。
    </p>
    <StudyNoteViewer v-if="viewId" :media-id="viewId" @close="viewId = ''" />
  </section>
</template>
<style scoped lang="scss">
.study-note {
  margin: 20px 0;

  h2 {
    font-size: 18px;
  }

  p {
    margin-top: 12px;
    line-height: 1.8;
  }

  .pdf-badge {
    padding: 12px 8px;
    border: 1px solid #b7cca7;
    border-radius: 5px;
    color: var(--ink);
    font-size: 12px;
  }

  .file-card {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    padding: 18px;
    background: #fbfdf8;
    border: 1px solid var(--line);
    border-radius: 9px;
    margin-top: 16px;

    span {
      font-size: 12px;
      color: var(--muted);
    }
  }

  .candidates {
    padding: 12px 0;

    :deep(.el-radio-group) {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    :deep(.el-radio) {
      height: auto;
      min-height: 36px;
      white-space: normal;
    }
  }

  .tools {
    margin-top: 16px;
    flex-wrap: wrap;

    label {
      position: relative;

      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        width: 100%;
        cursor: pointer;
      }
    }
  }

  .help {
    color: var(--muted);
    font-size: 12px;
  }
}
</style>

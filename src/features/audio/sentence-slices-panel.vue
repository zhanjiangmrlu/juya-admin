<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import ContentStageRecoveryPanel from '@/features/content-import/content-stage-recovery-panel.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { SceneRevision } from '@/features/content/content-model'
import type { DialogueRow, SceneContent } from '@/features/content-editor/scene-form'

import { createSegmentPlayer } from './segment-player'
import { createSentenceSliceAdapter } from './sentence-slice-adapter'
import {
  canListenSlice,
  invalidateSentenceSlice,
  type SentenceSlice,
  validSliceBoundary
} from './sentence-slice-model'

const props = defineProps<{
  form: SceneContent
  revisionId: string
  expectedVersion: number
  disabled: boolean
  dirty?: boolean
  prepare: () => Promise<SceneRevision | null>
}>()
const emit = defineEmits<{ saved: [revision: SceneRevision]; busy: [value: boolean] }>()
const client = useAdminApiClient()
const adapter = createSentenceSliceAdapter(client)
const content = createContentAdapter(client)
const slices = ref<SentenceSlice[]>([])
const busy = ref(false)
const error = ref('')
const selectedId = ref('')
const panel = ref<globalThis.HTMLElement | null>(null)
const audio = ref<globalThis.HTMLAudioElement | null>(null)
const player = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const heard = ref(new Map<string, string>())
const listening = ref<{ id: string; token: string } | null>(null)
const commandKeys = new Map<string, string>()
let generation = 0
let disposed = false
let pollTimer: ReturnType<typeof globalThis.setTimeout> | undefined
const loadedRevisionKeys = new Set<string>()
const statusLabels: Record<string, string> = {
  CONFIRMED: '实际切片已确认',
  READY: '实际切片可试听',
  PENDING: '等待切片',
  RUNNING: '切片生成中',
  FAILED: '生成失败',
  STALE: '边界已变化',
  READY_TO_LISTEN: '实际切片可试听',
  PREPARING: '切片处理中',
  REVIEW_PENDING: '素材审核中',
  UNALIGNED: '尚未确认边界',
  SOURCE_NOT_READY: '原音频未准备',
  CANCELLED: '任务已取消'
}
const /**
   * 展开所选句子的边界表单并定位开始输入框
   * @param row - 管理员选择修正的句子
   */ adjustBoundary = async (row: DialogueRow): Promise<void> => {
    if (busy.value || props.disabled) return
    selectedId.value = row.id
    await nextTick()
    const form = panel.value?.querySelector<globalThis.HTMLElement>('.boundary-form')
    form?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    form?.querySelector('input')?.focus({ preventScroll: true })
  }
const /**
   * 绑定人工作业到实际切片资源与依赖
   * @param slice - 服务端固定切片
   * @returns 该文件的试听身份
   */ token = (slice: SentenceSlice | undefined): string =>
    slice ? `${slice.resourceVersion}:${slice.dependencyHash}:${slice.sourceVersion}` : ''
const /**
   * 校验这句当前文件确已完整播放
   * @param row - 当前句子
   * @returns 是否试听当前同一文件
   */ hasHeard = (row: DialogueRow): boolean =>
    heard.value.get(row.id) === token(findSlice(row)) && !!token(findSlice(row))
const /** 仅在实际文件自然播放结束后允许人工确认 */ ended = (): void => {
    if (listening.value) heard.value.set(listening.value.id, listening.value.token)
    listening.value = null
  }
const /**
   * 查找句子的实际固定切片
   * @param row - 当前句子
   * @returns 服务端切片或空值
   */ findSlice = (row: DialogueRow): SentenceSlice | undefined =>
    slices.value.find((slice) => slice.sentenceId === row.id)
const /** 刷新实际文件列表，不把时间区间当作切片 */ load = async (): Promise<void> => {
    if (!adapter.available || busy.value) return
    const current = ++generation
    error.value = ''
    try {
      const result = await adapter.list(props.revisionId)
      if (disposed || current !== generation) return
      slices.value = result
      const version = Math.max(0, ...result.map((slice) => slice.editVersion ?? 0))
      if (version > props.expectedVersion) await reloadCurrent(version, current)
      if (disposed || current !== generation) return
      globalThis.clearTimeout(pollTimer)
      if (
        !disposed &&
        !props.dirty &&
        result.some((slice) =>
          ['PENDING', 'QUEUED', 'PREPARING', 'RUNNING', 'REVIEW_PENDING'].includes(slice.status)
        )
      )
        pollTimer = globalThis.setTimeout(() => void load(), 2000)
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.status === 409 &&
        !props.dirty &&
        !props.disabled &&
        !disposed &&
        current === generation
      ) {
        try {
          if (await reloadCurrent(props.expectedVersion + 1, current)) {
            pollTimer = globalThis.setTimeout(() => void load(), 2000)
            return
          }
        } catch {
          /* 重载失败保留原始冲突，管理员可明确刷新 */
        }
      }
      if (!disposed && current === generation)
        error.value = failure instanceof Error ? failure.message : '切片加载失败'
    }
  }
const /**
   * 工作任务递增版本时只接受同源正文的真实新草稿，不覆盖未保存编辑
   * @param minimumVersion - 切片状态所需的最低编辑版本
   * @param current - 当前读取请求的代次
   * @returns 是否已向页面同步新草稿
   */ reloadCurrent = async (minimumVersion: number, current: number): Promise<boolean> => {
    if (props.dirty || props.disabled || disposed || current !== generation) return false
    const saved = await content.getRevision(props.revisionId)
    if (disposed || current !== generation || props.dirty || props.disabled) return false
    const savedForm = normalizeSceneContent(saved.content)
    const key = `${props.revisionId}:${saved.version}`
    if (
      saved.id !== props.revisionId ||
      saved.version < minimumVersion ||
      loadedRevisionKeys.has(key) ||
      savedForm.audio?.version_id !== props.form.audio?.version_id ||
      savedForm.dialogue.length !== props.form.dialogue.length ||
      !savedForm.dialogue.every((line) =>
        props.form.dialogue.some(
          (existing) => existing.id === line.id && existing.english === line.english
        )
      )
    )
      return false
    loadedRevisionKeys.add(key)
    emit('saved', saved)
    return true
  }
const /**
   * 修改边界撤销该句试听及旧引用
   * @param row - 正在调整的句子
   */ invalidate = (row: DialogueRow): void => {
    generation++
    player.value?.stop()
    listening.value = null
    invalidateSentenceSlice(row)
    heard.value.delete(row.id)
  }
const /**
   * 试听当前源版本下已生成的独立文件
   * @param row - 管理员选择的句子
   */ listen = async (row: DialogueRow): Promise<void> => {
    if (busy.value || props.disabled) return
    const slice = findSlice(row)
    if (!canListenSlice(row, slice, props.form.audio?.version_id ?? '') || !slice?.resourceVersion)
      return
    const current = ++generation
    player.value?.stop()
    error.value = ''
    try {
      const refreshed = (await adapter.list(props.revisionId)).find(
        (item) => item.sentenceId === row.id
      )
      if (
        !refreshed?.url ||
        refreshed.resourceVersion !== slice.resourceVersion ||
        refreshed.dependencyHash !== slice.dependencyHash
      )
        throw new Error('切片文件或版本已变化，请刷新后重新试听')
      if (disposed || current !== generation) return
      listening.value = { id: row.id, token: token(refreshed) }
      await player.value?.play(row.id, refreshed.url)
    } catch (failure) {
      if (!disposed)
        error.value = failure instanceof Error ? failure.message : '独立切片试听失败，请刷新'
    }
  }
const /**
   * 重切或人工确认单句，失败复用相同命令
   * @param row - 要处理的句子
   * @param confirm - 是否确认实际文件已经人工试听
   */ command = async (row: DialogueRow, confirm = false): Promise<void> => {
    const source = props.form.audio
    const slice = findSlice(row)
    if (
      !adapter.available ||
      busy.value ||
      props.disabled ||
      !source ||
      !validSliceBoundary(row.start_ms, row.end_ms, source.duration_ms)
    )
      return
    if (confirm && (!slice || !hasHeard(row) || !canListenSlice(row, slice, source.version_id)))
      return
    let expectedVersion = props.expectedVersion
    const revisionId = props.revisionId
    const boundary = { ...row }
    const /** 绑定当前保存版本和人工单句输入的重试身份
       * @returns 固定单句命令身份
       */ signatureFor = (): string =>
        JSON.stringify([
          confirm,
          props.revisionId,
          expectedVersion,
          source.version_id,
          row.id,
          row.start_ms,
          row.end_ms,
          slice?.resourceVersion
        ])
    const current = ++generation
    busy.value = true
    player.value?.stop()
    error.value = ''
    try {
      const saved = await props.prepare()
      if (!saved || disposed || current !== generation || revisionId !== props.revisionId) return
      expectedVersion = saved.version
      const signature = signatureFor()
      if (!commandKeys.has(signature)) commandKeys.set(signature, createIdempotencyKey())
      emit('busy', true)
      const result = confirm
        ? await adapter.confirm(
            props.revisionId,
            expectedVersion,
            slice!,
            commandKeys.get(signature)!
          )
        : await adapter.recut(
            props.revisionId,
            expectedVersion,
            source.version_id,
            boundary,
            commandKeys.get(signature)!
          )
      if (disposed || current !== generation) return
      emit('saved', result)
      if (!confirm) heard.value.delete(row.id)
    } catch (failure) {
      if (!disposed && current === generation)
        error.value = failure instanceof Error ? failure.message : '单句处理失败'
    } finally {
      if (!disposed && current === generation) {
        busy.value = false
        emit('busy', false)
        await load()
      }
    }
  }
watch(
  [
    () => props.revisionId,
    () => props.form.audio?.version_id,
    () => props.expectedVersion,
    () => props.dirty
  ],
  (next, previous) => {
    if (busy.value && next[0] === previous[0] && next[1] === previous[1]) return
    generation++
    busy.value = false
    emit('busy', false)
    player.value?.stop()
    globalThis.clearTimeout(pollTimer)
    slices.value = []
    heard.value.clear()
    void load()
  }
)
onMounted(() => {
  if (audio.value) player.value = createSegmentPlayer(audio.value)
  void load()
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  globalThis.clearTimeout(pollTimer)
  player.value?.dispose()
  emit('busy', false)
  slices.value = []
})
</script>
<template>
  <AdminPanel title="句子与实际单句文件" class="sentence-slices-panel">
    <p>边界以实际源音频时长为准。修改后仅重生成这一句，试听独立文件后再确认。</p>
    <ElAlert
      v-if="!adapter.available"
      title="实际切片 API 等待装配，当前不能生成或确认"
      type="warning"
      :closable="false"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div ref="panel">
      <div class="table-scroll">
        <ElTable :data="form.dialogue"
          ><ElTableColumn label="句子 / 完整中文" min-width="300"
            ><template #default="{ row, $index }"
              ><strong>{{ $index + 1 }}. {{ row.speaker }} {{ row.english }}</strong>
              <p>{{ row.chinese }}</p></template
            ></ElTableColumn
          ><ElTableColumn label="边界（毫秒）" min-width="150"
            ><template #default="{ row }"
              >{{ row.start_ms ?? '待标记' }} → {{ row.end_ms ?? '待标记' }}</template
            ></ElTableColumn
          ><ElTableColumn label="单句文件" min-width="155"
            ><template #default="{ row }"
              >{{
                findSlice(row)
                  ? statusLabels[findSlice(row)!.status] || findSlice(row)!.status
                  : '尚无实际切片'
              }}<small v-if="findSlice(row)?.confirmed">人工已确认</small></template
            ></ElTableColumn
          ><ElTableColumn label="操作" min-width="185"
            ><template #default="{ row }"
              ><ElButton
                link
                :disabled="
                  busy ||
                  disabled ||
                  !canListenSlice(row, findSlice(row), form.audio?.version_id ?? '')
                "
                @click="listen(row)"
                >试听独立文件</ElButton
              ><ElButton link :disabled="busy || disabled" @click="adjustBoundary(row)"
                >调整边界</ElButton
              ></template
            ></ElTableColumn
          ></ElTable
        >
      </div>
      <div
        v-for="row in form.dialogue.filter((item) => item.id === selectedId)"
        :key="row.id"
        class="boundary-form"
      >
        <strong>{{ row.speaker }} {{ row.english }}</strong>
        <p>{{ row.chinese }}</p>
        <ElForm label-position="top" :disabled="disabled || busy"
          ><ElFormItem label="开始毫秒"
            ><ElInputNumber
              v-model="row.start_ms"
              :min="0"
              :max="form.audio?.duration_ms"
              :precision="0"
              :step="10"
              @change="invalidate(row)" /></ElFormItem
          ><ElFormItem label="结束毫秒"
            ><ElInputNumber
              v-model="row.end_ms"
              :min="0"
              :max="form.audio?.duration_ms"
              :precision="0"
              :step="10"
              @change="invalidate(row)" /></ElFormItem
        ></ElForm>
        <div class="actions">
          <ElButton
            type="primary"
            :disabled="
              !adapter.available ||
              disabled ||
              busy ||
              !validSliceBoundary(row.start_ms, row.end_ms, form.audio?.duration_ms ?? 0)
            "
            @click="command(row)"
            >仅重生成这一句</ElButton
          ><ElButton
            :disabled="
              !adapter.available ||
              disabled ||
              busy ||
              !hasHeard(row) ||
              !canListenSlice(row, findSlice(row), form.audio?.version_id ?? '')
            "
            @click="command(row, true)"
            >人工试听后确认这一句</ElButton
          >
        </div>
        <ContentStageRecoveryPanel
          v-if="findSlice(row)?.status === 'FAILED' && findSlice(row)?.stageId && !dirty"
          :stage-id="findSlice(row)!.stageId!"
          :expected-edit-version="expectedVersion"
          @retried="load"
        />
      </div>
    </div>
    <div class="actions">
      <ElButton :disabled="!adapter.available || busy" @click="load">刷新切片状态</ElButton
      ><span aria-live="polite">{{ player?.statusText.value }} {{ player?.error.value }}</span>
    </div>
    <audio ref="audio" controls preload="none" @ended="ended" />
  </AdminPanel>
</template>
<style scoped lang="scss">
.sentence-slices-panel {
  min-width: 0;

  .table-scroll {
    overflow-x: auto;
  }

  p {
    color: var(--juya-color-text-secondary);
    line-height: 1.7;
    white-space: pre-wrap;
    margin: 8px 0;
  }

  small {
    display: block;
    margin-top: 5px;
    color: var(--el-color-primary);
  }

  .boundary-form {
    margin-top: 18px;
    padding: 16px 0;
  }

  .boundary-form :deep(.el-form) {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
  }

  audio {
    width: 100%;
    max-width: 600px;
  }
}
</style>

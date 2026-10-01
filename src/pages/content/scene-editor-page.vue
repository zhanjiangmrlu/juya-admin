<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import LexiconFields from '@/features/content-editor/lexicon-fields.vue'
import {
  createRevisionController,
  type RevisionController
} from '@/features/content-editor/revision-controller'
import {
  createDialogueRow,
  createLexiconRow,
  normalizeSceneContent,
  replaceSceneAudio
} from '@/features/content-editor/scene-form'
import SceneHistory from '@/features/content-editor/scene-history.vue'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import OcrComparisonLines from '@/features/ocr/ocr-comparison-lines.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { AudioElement } from '@/features/audio/segment-player'
import type { SceneRevision, SceneSummary } from '@/features/content/content-model'
import type { DialogueRow, LexiconRow } from '@/features/content-editor/scene-form'
import type { OcrQuota } from '@/features/ocr/ocr-adapter'
import type { OcrJob } from '@/features/ocr/ocr-model'
import type { OcrGroup, OcrSuggestions } from '@/features/ocr/ocr-suggestions'
import type { UploadFile } from 'element-plus'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id))
const client = useAdminApiClient()
const adapter = createContentAdapter(client)
const media = createSceneMediaAdapter(client)
const audioAdapter = createAudioAdapter(client)
const ocr = createOcrAdapter(client)
const scene = ref<SceneSummary | null>(null)
const revision = ref<SceneRevision | null>(null)
const controller = shallowRef<RevisionController | null>(null)
const form = reactive(normalizeSceneContent({}))
const candidate = reactive(normalizeSceneContent({}))
const state = ref<'error' | 'loading' | 'ready' | 'saving'>('loading')
const error = ref('')
const mediaBusy = ref(false)
const lexiconBusy = reactive({ vocabulary: false, chunks: false })
const assetsBusy = computed(() => mediaBusy.value || lexiconBusy.vocabulary || lexiconBusy.chunks)
const imageUrl = ref('')
const audioVersions = ref<AudioVersion[]>([])
const audioTargetId = ref('')
const selectedAudioVersion = ref('')
const pendingAudioFile = shallowRef<UploadFile | null>(null)
let pendingAudioKey = ''
let pendingAudioVersion: AudioVersion | null = null
let pendingAudioConfirmKey = ''
const showPreview = ref(false)
const historyOpened = ref(false)
const quota = ref<OcrQuota | null>(null)
const job = ref<OcrJob | null>(null)
const ocrBusy = ref(false)
let pendingOcrKey: string | null = null
let pendingOcrContext: string | null = null
const candidateReady = ref(false)
const rawLines = ref<string[]>([])
const suggestions = ref<OcrSuggestions | null>(null)
const acceptedGroups = ref<string[]>([])
const selectedFields = ref<string[]>([])
const assignedLines = new Map<string, DialogueRow | LexiconRow>()
const currentVersion = computed(() => controller.value?.revision.value ?? 0)
const hasConflict = computed(() => controller.value?.conflict.value ?? false)
const audioElement = ref<AudioElement | null>(null)
const player = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const audioUrl = ref('')
let audioGeneration = 0

/** 加载同一场景的当前草稿。 */
async function load(): Promise<void> {
  state.value = 'loading'
  error.value = ''
  player.value?.stop()
  audioGeneration++
  try {
    scene.value = await adapter.getScene(sceneId.value)
    if (!scene.value.draftRevisionId) throw new Error('该场景当前没有可编辑草稿，请先创建草稿')
    accept(await adapter.getRevision(scene.value.draftRevisionId))
    state.value = 'ready'
    await refreshImage()
    if (route.query.ocrJob) job.value = await ocr.getJob(String(route.query.ocrJob))
  } catch (failure) {
    error.value = message(failure)
    state.value = 'error'
  }
}
/** 应用服务端固定版本，刷新服务端生成的词库引用。
 * @param value - 已保存版本
 */
function accept(value: SceneRevision): void {
  revision.value = value
  if (!controller.value) controller.value = createRevisionController(value.version, value.content)
  else controller.value.acceptSavedVersion(value.version, value.content)
  Object.assign(form, normalizeSceneContent(value.content))
}
/** 保存结构化草稿，冲突时保留全部输入。
 * @returns 是否保存成功
 */
async function save(): Promise<boolean> {
  if (!revision.value || hasConflict.value || assetsBusy.value) return false
  state.value = 'saving'
  error.value = ''
  try {
    accept(
      await adapter.saveRevision(
        revision.value.id,
        currentVersion.value,
        normalizeSceneContent({ ...form })
      )
    )
    ElMessage.success('草稿已保存')
    return true
  } catch (failure) {
    controller.value?.handleSaveFailure(failure)
    error.value = message(failure)
    return false
  } finally {
    state.value = 'ready'
  }
}
/** 刷新管理员学习原图。 */
async function refreshImage(): Promise<void> {
  imageUrl.value = ''
  if (!form.original_image_asset_id) return
  try {
    imageUrl.value = (await media.signedUrl(form.original_image_asset_id)).url
  } catch (failure) {
    error.value = message(failure)
  }
}
/** 上传原图，只确认素材，不触发 OCR。
 * @param file - 选择的图片
 */
async function uploadImage(file: UploadFile): Promise<void> {
  if (!file.raw) return
  mediaBusy.value = true
  try {
    const asset = await media.uploadImage(file.raw)
    form.original_image_asset_id = asset.id
    await refreshImage()
    ElMessage.success('原图已上传，可继续手工录入或显式识别')
  } catch (failure) {
    error.value = message(failure)
  } finally {
    mediaBusy.value = false
  }
}
/** 刷新或创建本场景的整段音频目标。 */
async function loadAudio(): Promise<void> {
  mediaBusy.value = true
  try {
    const target = await media.createSceneAudioTarget(sceneId.value)
    audioTargetId.value = target.id
    audioVersions.value = await audioAdapter.listVersions(target.id)
    selectedAudioVersion.value = form.audio?.version_id ?? ''
  } catch (failure) {
    error.value = message(failure)
  } finally {
    mediaBusy.value = false
  }
}
/** 上传本场景整段音频。
 * @param file - 选择的音频文件
 */
async function uploadAudio(file: UploadFile): Promise<void> {
  if (!file.raw) return
  if (pendingAudioFile.value?.raw !== file.raw) {
    pendingAudioKey = createIdempotencyKey()
    pendingAudioConfirmKey = createIdempotencyKey()
    pendingAudioVersion = null
  }
  pendingAudioFile.value = file
  mediaBusy.value = true
  try {
    if (!audioTargetId.value) await loadAudio()
    if (!audioTargetId.value) return
    const version =
      pendingAudioVersion ??
      (await audioAdapter.uploadFile(
        audioTargetId.value,
        file.raw,
        pendingAudioKey,
        () => undefined,
        new globalThis.AbortController().signal
      ))
    pendingAudioVersion = version
    await audioAdapter.confirmVersion(version.id, pendingAudioConfirmKey)
    audioVersions.value = await audioAdapter.listVersions(audioTargetId.value)
    selectedAudioVersion.value = version.id
    await bindAudio(version.id)
    pendingAudioFile.value = null
    pendingAudioVersion = null
  } catch (failure) {
    error.value = message(failure)
  } finally {
    mediaBusy.value = false
  }
}
/** 将草稿固定到选择的音频版本，并重置旧时间点。
 * @param id - 音频版本编号
 */
async function bindAudio(id: string): Promise<void> {
  audioGeneration++
  player.value?.stop()
  const version = audioVersions.value.find((item) => item.id === id)
  if (!version) return
  try {
    const metadata = await media.metadata(version.assetId)
    if (!metadata.duration_ms) throw new Error('音频尚未通过真实时长校验')
    replaceSceneAudio(form, {
      target_id: version.targetId,
      version_id: version.id,
      asset_id: version.assetId,
      duration_ms: metadata.duration_ms
    })
  } catch (failure) {
    error.value = message(failure)
  }
}
/** 装载当前绑定音频，不需要预先填写句子区间。 */
async function loadAudioSource(): Promise<void> {
  const current = ++audioGeneration
  player.value?.stop()
  audioUrl.value = ''
  if (!player.value) return
  if (!form.audio) {
    player.value.load('')
    return
  }
  try {
    const signed = await media.signedUrl(form.audio.asset_id)
    if (current !== audioGeneration) return
    audioUrl.value = signed.url
    player.value.load(signed.url)
  } catch (failure) {
    error.value = message(failure)
  }
}
/**
 * 同一按钮暂停或续播，重新播放失败时刷新签名。
 * @param row - 本次编辑的句子
 */
async function playRow(row?: DialogueRow): Promise<void> {
  if (!form.audio || (row && (row.start_ms === null || row.end_ms === null))) return
  const current = ++audioGeneration
  const assetId = form.audio.asset_id
  try {
    if (!audioUrl.value || player.value?.status.value === 'error') {
      player.value?.stop()
      const signed = await media.signedUrl(assetId)
      if (current !== audioGeneration || form.audio?.asset_id !== assetId) return
      audioUrl.value = signed.url
      player.value?.load(signed.url)
    }
    if (current !== audioGeneration) return
    if (audioUrl.value)
      await player.value?.play(
        row?.id ?? 'scene',
        audioUrl.value,
        row?.start_ms ?? 0,
        row?.end_ms ?? null
      )
  } catch (failure) {
    if (current === audioGeneration) error.value = message(failure)
  }
}
/**
 * 采集普通播放器当前时间，编辑后必须重新人工确认。
 * @param row - 本次编辑的句子
 * @param edge - 采集的起点或终点字段
 */
function recordTime(row: DialogueRow, edge: 'start_ms' | 'end_ms'): void {
  if (!form.audio || !audioUrl.value || !audioElement.value) return
  row[edge] = Math.min(
    form.audio.duration_ms,
    Math.max(0, Math.round(audioElement.value.currentTime * 1000))
  )
  row.timing_confirmed = false
  row.audio_version_id = null
}
watch(
  audioElement,
  (element) => {
    player.value?.dispose()
    player.value = element ? createSegmentPlayer(element) : null
    void loadAudioSource()
  },
  { flush: 'post' }
)
watch(
  () => form.audio?.asset_id,
  () => void loadAudioSource(),
  { flush: 'post' }
)
/** 用户明确创建 OCR 任务前保存同一草稿。 */
async function startOcr(): Promise<void> {
  if (ocrBusy.value || !form.original_image_asset_id || !revision.value || !scene.value) return
  ocrBusy.value = true
  try {
    const context = JSON.stringify([
      sceneId.value,
      revision.value.id,
      scene.value.seriesId,
      form.original_image_asset_id,
      scene.value.templateType
    ])
    const replayPending = pendingOcrKey !== null && pendingOcrContext === context
    quota.value = await ocr.getQuota()
    // A lost creation response may already have reserved the final quota slot.
    if (!quota.value.enabled || (quota.value.remaining <= 0 && !replayPending))
      throw new Error('OCR 未启用或本月额度已用完')
    if (!(await save())) return
    if (pendingOcrContext !== context || pendingOcrKey === null) {
      pendingOcrContext = context
      pendingOcrKey = createIdempotencyKey()
    }
    job.value = await ocr.createJob(
      form.original_image_asset_id,
      scene.value.seriesId,
      sceneId.value,
      revision.value.id,
      pendingOcrKey,
      scene.value.templateType ?? 'dialogue'
    )
    pendingOcrKey = null
    pendingOcrContext = null
    await router.replace({ query: { ...route.query, ocrJob: job.value.id } })
    candidateReady.value = false
    suggestions.value = null
    acceptedGroups.value = []
    rawLines.value = []
    selectedFields.value = []
    assignedLines.clear()
    ElMessage.success('识别任务已创建，可手动刷新状态')
  } catch (failure) {
    error.value = message(failure)
  } finally {
    ocrBusy.value = false
  }
}
/** 拉取实际任务和 OCR 原始候选，不自动覆盖草稿。 */
async function refreshOcr(): Promise<void> {
  if (!job.value) return
  ocrBusy.value = true
  try {
    job.value = await ocr.getJob(job.value.id)
    if (job.value.status === 'SUCCEEDED') {
      const result = await ocr.getCandidate(job.value.id)
      if (result.confirmedRevisionId) {
        candidateReady.value = false
        acceptedGroups.value = []
        selectedFields.value = []
        assignedLines.clear()
        ElMessage.info('该识别结果已采纳，请在当前草稿继续编辑')
        return
      }
      const blocks = Array.isArray(result.content.blocks) ? result.content.blocks : []
      rawLines.value = blocks
        .map((block) =>
          typeof block === 'object' && block && 'text' in block ? String(block.text) : ''
        )
        .filter(Boolean)
      if (!rawLines.value.length && typeof result.content.text === 'string')
        rawLines.value = result.content.text.split('\n').filter(Boolean)
      if (!candidateReady.value) {
        Object.assign(candidate, normalizeSceneContent({}))
        acceptedGroups.value = []
        selectedFields.value = []
        assignedLines.clear()
      }
      candidateReady.value = true
      if (revision.value)
        suggestions.value = await ocr.getSuggestions(revision.value.id, job.value.id)
    }
  } catch (failure) {
    error.value = message(failure)
  } finally {
    ocrBusy.value = false
  }
}
/** 手工将识别行放入需要的候选字段。
 * @param text - OCR 原始行
 * @param field - 候选字段
 * @param lineId - 原图中的独立识别行编号
 */
function assignLine(text: string, field: string, lineId: number): void {
  const identity = `${field}:${lineId}`
  const assigned = assignedLines.get(identity)
  if (!selectedFields.value.includes(field)) selectedFields.value.push(field)
  if (field === 'title_en' || field === 'title_zh') candidate[field] = text
  else if (field === 'dialogue') {
    if (candidate.dialogue.some((row) => row === assigned)) return
    const existing = form.dialogue.find(
      (row) => row.english === text && !candidate.dialogue.some((item) => item.id === row.id)
    )
    candidate.dialogue.push(
      existing ? JSON.parse(JSON.stringify(existing)) : { ...createDialogueRow(), english: text }
    )
    assignedLines.set(identity, candidate.dialogue.at(-1)!)
  } else if (field === 'vocabulary' || field === 'chunks') {
    if (candidate[field].some((row) => row === assigned)) return
    const existing = form[field].find((entry) => entry.english === text)
    if (!candidate[field].some((entry) => entry.english === text))
      candidate[field].push(
        existing ? JSON.parse(JSON.stringify(existing)) : { ...createLexiconRow(), english: text }
      )
    assignedLines.set(
      identity,
      candidate[field].find((entry) => entry.english === text)!
    )
  }
}
/**
 * 管理员确认后才把分组行放入可编辑候选。
 * @param group - 管理员明确确认的分组建议
 */
function acceptGroup(group: OcrGroup): void {
  if (!suggestions.value || acceptedGroups.value.includes(group.field)) return
  for (const id of group.line_ids) {
    const line = suggestions.value.lines.find((item) => item.id === id)
    if (line)
      assignLine(
        line.text,
        group.field === 'title'
          ? /[\u4e00-\u9fff]/.test(line.text)
            ? 'title_zh'
            : 'title_en'
          : group.field,
        line.id
      )
  }
  acceptedGroups.value.push(group.field)
}
/** 用当前乐观锁版本逐项采纳，非选择字段保留服务端草稿。 */
async function adopt(): Promise<void> {
  if (!revision.value || !job.value || !selectedFields.value.length) return
  ocrBusy.value = true
  try {
    if (!(await save())) return
    accept(
      await adapter.adoptOcr(
        revision.value.id,
        job.value.id,
        currentVersion.value,
        selectedFields.value,
        { ...candidate }
      )
    )
    candidateReady.value = false
    acceptedGroups.value = []
    selectedFields.value = []
    assignedLines.clear()
    ElMessage.success('选中字段已采纳到当前草稿')
  } catch (failure) {
    controller.value?.handleSaveFailure(failure)
    error.value = message(failure)
  } finally {
    ocrBusy.value = false
  }
}
/** 移除整段音频并重置标时。 */
function removeAudio(): void {
  audioGeneration++
  player.value?.stop()
  replaceSceneAudio(form, null)
}
/** 打开已保存草稿的设备预览。 */
async function preview(): Promise<void> {
  audioGeneration++
  player.value?.stop()
  if (await save()) showPreview.value = true
}
/** 返回错误文案。
 * @param failure - 操作异常
 * @returns 用户可读错误
 */
function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : '操作失败'
}
onMounted(async () => {
  await load()
})
onBeforeUnmount(() => {
  audioGeneration++
  player.value?.dispose()
})
</script>
<template>
  <section class="scene-editor-page">
    <div class="page-heading">
      <div>
        <h2>场景编辑 · {{ scene?.title || sceneId }}</h2>
        <p>手工录入或从学习原图识别；保存草稿时同步固定词库版本。</p>
      </div>
      <div class="heading-actions">
        <ElTag v-if="revision" effect="plain" type="warning">草稿 v{{ currentVersion }}</ElTag
        ><ElButton :disabled="state !== 'ready' || hasConflict || assetsBusy" @click="preview"
          >设备预览</ElButton
        ><ElButton :disabled="assetsBusy" @click="historyOpened = true">完整版本历史</ElButton
        ><ElButton
          :disabled="state !== 'ready' || hasConflict || assetsBusy"
          :loading="state === 'saving'"
          type="primary"
          @click="save"
          >保存草稿</ElButton
        ><RouterLink
          v-if="revision"
          :to="{ name: 'content-scene-publish', params: { id: revision.id } }"
          >检查发布</RouterLink
        >
      </div>
    </div>
    <ElSkeleton v-if="state === 'loading'" :rows="10" animated />
    <fieldset
      v-else
      class="editor-fields"
      :disabled="state === 'saving' || ocrBusy"
      :inert="state === 'saving' || ocrBusy"
      :aria-busy="state === 'saving' || ocrBusy"
      aria-label="场景内容编辑"
    >
      <ElAlert
        v-if="hasConflict"
        :closable="false"
        :title="`远端已更新到 v${controller?.remoteVersion.value ?? '未知'}，本地输入已保留且自动保存已停止`"
        type="warning"
        ><template #default
          ><ElButton link @click="load">明确放弃本地内容并重新加载</ElButton></template
        ></ElAlert
      >
      <ElAlert v-else-if="error" :closable="false" :title="error" type="error"
        ><template #default
          ><ElButton v-if="state === 'error'" @click="load">重新加载</ElButton></template
        ></ElAlert
      >
      <div v-if="revision" class="editor-grid">
        <div class="editor-stack">
          <ElCard shadow="never"
            ><template #header><h3>基础信息与学习原图</h3></template
            ><ElForm label-position="top"
              ><ElFormItem label="英文标题"
                ><ElInput
                  v-model="form.title_en"
                  aria-label="英文标题"
                  maxlength="120" /></ElFormItem
              ><ElFormItem label="中文标题"
                ><ElInput
                  v-model="form.title_zh"
                  aria-label="中文标题"
                  maxlength="120" /></ElFormItem
              ><ElFormItem label="所属系列"
                ><ElInput :model-value="scene?.seriesTitle" disabled /></ElFormItem
              ><ElFormItem label="场景说明"
                ><ElInput v-model="form.summary" type="textarea" /></ElFormItem
              ><ElFormItem label="标签"
                ><ElSelect v-model="form.tags" multiple filterable allow-create default-first-option
                  ><ElOption
                    v-for="tag in form.tags"
                    :key="tag"
                    :label="tag"
                    :value="tag" /></ElSelect></ElFormItem
              ><ElFormItem label="学习原图素材编号"
                ><ElInput
                  v-model="form.original_image_asset_id"
                  clearable
                  @change="refreshImage" /></ElFormItem
              ><ElUpload
                :auto-upload="false"
                :show-file-list="false"
                accept="image/jpeg,image/png,image/webp"
                :disabled="mediaBusy"
                @change="uploadImage"
                ><ElButton :loading="mediaBusy">上传学习原图</ElButton></ElUpload
              ><img
                v-if="imageUrl"
                class="original-image"
                :src="imageUrl"
                alt="学习原图" /><ElFormItem label="封面素材编号"
                ><ElInput v-model="form.cover_asset_id" clearable /></ElFormItem
              ><ElFormItem label="版权声明"
                ><ElInput v-model="form.copyright" type="textarea" /></ElFormItem
              ><ElFormItem label="内容来源"><ElInput v-model="form.source" /></ElFormItem></ElForm
          ></ElCard>
          <ElCard shadow="never"
            ><template #header><h3>整段音频</h3></template>
            <p>绑定固定音频版本。更换版本后需重新标记并核对每句时间。</p>
            <ElButton :loading="mediaBusy" @click="loadAudio">加载音频版本</ElButton
            ><ElUpload
              :auto-upload="false"
              :show-file-list="false"
              accept=".mp3,.m4a,.wav,.aac"
              :disabled="mediaBusy"
              @change="uploadAudio"
              ><ElButton :loading="mediaBusy">上传整段音频</ElButton></ElUpload
            ><ElButton
              v-if="pendingAudioFile"
              :loading="mediaBusy"
              @click="uploadAudio(pendingAudioFile)"
              >重新确认已上传音频</ElButton
            ><ElSelect
              v-model="selectedAudioVersion"
              aria-label="整段音频版本"
              placeholder="选择固定版本"
              @change="bindAudio"
              ><ElOption
                v-for="version in audioVersions"
                :key="version.id"
                :label="`v${version.versionNo} · ${version.status} · ${version.assetId}`"
                :value="version.id"
            /></ElSelect>
            <p v-if="form.audio">
              当前 {{ form.audio.version_id }} · {{ form.audio.duration_ms }} 毫秒
            </p>
            <ElButton v-if="form.audio" @click="playRow()"
              >{{ player?.label('scene') ?? '播放' }}整段音频</ElButton
            >
            <p v-if="form.audio" aria-live="polite">
              当前 {{ player?.currentMs.value ?? 0 }} 毫秒 · {{ player?.statusText.value }}
              {{ player?.error.value }}
            </p>
            <ElButton v-if="form.audio" @click="loadAudioSource">刷新音频地址</ElButton
            ><ElButton v-if="form.audio" @click="removeAudio">移除整段音频</ElButton
            ><audio ref="audioElement" controls preload="metadata"
          /></ElCard>
          <ElCard shadow="never"
            ><template #header><h3>显式 OCR 识别</h3></template>
            <p>
              本次识别将消耗 1
              次接口调用，成功或失败均计次；重识别是新的调用。上传原图不会启动识别。分组建议无需额外接口。
            </p>
            <p v-if="quota">
              {{ quota.month }} · 剩余 {{ quota.remaining }} / {{ quota.monthly_limit }} ·
              {{ quota.enabled ? '已启用' : '已关闭' }}
            </p>
            <ElButton
              :disabled="!form.original_image_asset_id || hasConflict || assetsBusy"
              :loading="ocrBusy"
              @click="startOcr"
              >保存并识别原图</ElButton
            ><template v-if="job"
              ><p>
                任务 {{ job.id }} · {{ job.status }} {{ job.errorCode || '' }} · 百度请求编号
                {{ job.providerRequestId || '尚未返回' }}
              </p>
              <ElButton :loading="ocrBusy" @click="refreshOcr">刷新识别状态</ElButton></template
            ></ElCard
          >
        </div>
        <div class="editor-stack">
          <ElCard shadow="never"
            ><template #header><h3>对话与句子标时</h3></template
            ><DialogueFields
              v-model="form.dialogue"
              :audio="form.audio"
              :playback="player"
              :can-record="Boolean(audioUrl)"
              timing
              @play="playRow"
              @record="recordTime"
          /></ElCard>
          <ElCard shadow="never"
            ><template #header><h3>核心词汇</h3></template
            ><LexiconFields
              v-model="form.vocabulary"
              entry-type="vocabulary"
              :sentences="form.dialogue"
              :original-image-asset-id="form.original_image_asset_id"
              @busy="lexiconBusy.vocabulary = $event"
          /></ElCard>
          <ElCard shadow="never"
            ><template #header><h3>常用语块</h3></template
            ><LexiconFields
              v-model="form.chunks"
              entry-type="chunk"
              :sentences="form.dialogue"
              :original-image-asset-id="form.original_image_asset_id"
              @busy="lexiconBusy.chunks = $event"
          /></ElCard>
        </div>
      </div>
      <ElCard v-if="candidateReady" class="ocr-comparison" shadow="never"
        ><template #header><h3>候选比较与逐项采纳</h3></template>
        <OcrComparisonLines
          v-if="suggestions"
          :suggestions="suggestions"
          :accepted-groups="acceptedGroups"
          @assign="assignLine"
          @group="acceptGroup"
        />
        <p v-else>分组建议暂不可用，可手动分配原始识别行并继续校对。</p>
        <div v-for="(line, index) in suggestions ? [] : rawLines" :key="index" class="ocr-line">
          <span>{{ line }}</span
          ><ElDropdown @command="assignLine(line, $event, index)"
            ><ElButton>分配候选字段</ElButton
            ><template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="title_en">英文标题</ElDropdownItem
                ><ElDropdownItem command="title_zh">中文标题</ElDropdownItem
                ><ElDropdownItem command="dialogue">对话句子</ElDropdownItem
                ><ElDropdownItem command="vocabulary">词汇</ElDropdownItem
                ><ElDropdownItem command="chunks">语块</ElDropdownItem></ElDropdownMenu
              ></template
            ></ElDropdown
          >
        </div>
        <div class="comparison-grid">
          <div>
            <h4>当前草稿</h4>
            <p>{{ form.title_en }} / {{ form.title_zh }}</p>
            <p v-for="row in form.dialogue" :key="row.id">
              {{ row.speaker }} · {{ row.english }} / {{ row.chinese }}
            </p>
            <p
              v-for="entry in [...form.vocabulary, ...form.chunks]"
              :key="entry.entry_id + entry.english"
            >
              {{ entry.english }} · {{ entry.chinese }}
            </p>
          </div>
          <div>
            <h4>识别候选（可编辑）</h4>
            <ElCheckboxGroup v-model="selectedFields"
              ><ElCheckbox value="title_en">英文标题</ElCheckbox
              ><ElCheckbox value="title_zh">中文标题</ElCheckbox
              ><ElCheckbox value="dialogue">对话</ElCheckbox
              ><ElCheckbox value="vocabulary">词汇</ElCheckbox
              ><ElCheckbox value="chunks">语块</ElCheckbox></ElCheckboxGroup
            ><ElInput v-model="candidate.title_en" aria-label="候选英文标题" /><ElInput
              v-model="candidate.title_zh"
              aria-label="候选中文标题"
            /><DialogueFields v-model="candidate.dialogue" /><LexiconFields
              v-model="candidate.vocabulary"
              candidate
              entry-type="vocabulary"
              :sentences="candidate.dialogue"
            /><LexiconFields
              v-model="candidate.chunks"
              candidate
              entry-type="chunk"
              :sentences="candidate.dialogue"
            />
          </div>
        </div>
        <ElButton
          type="primary"
          :loading="ocrBusy"
          :disabled="!selectedFields.length || hasConflict || assetsBusy"
          @click="adopt"
          >采纳选中字段到当前草稿</ElButton
        ></ElCard
      >
    </fieldset>
    <ElDialog v-model="showPreview" title="场景设备预览" width="min(960px, 94vw)"
      ><ScenePreview
        v-if="showPreview && revision"
        :content="revision.content"
        :revision-id="revision.id"
    /></ElDialog>
    <SceneHistory v-model="historyOpened" :scene-id="sceneId" />
  </section>
</template>
<style scoped lang="scss">
.page-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

h3 {
  margin: 0;
  font-size: 15px;
}

p {
  color: var(--juya-color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.heading-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(420px, 3fr);
  gap: 14px;
  margin-top: 14px;
}

.editor-fields {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.editor-stack {
  display: grid;
  align-content: start;
  gap: 14px;
}

.original-image {
  width: 100%;
  max-height: 320px;
  margin: 12px 0;
  object-fit: contain;
}

audio {
  width: 100%;
  margin-top: 12px;
}

.ocr-comparison {
  margin-top: 14px;
}

.ocr-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin: 16px 0;
}

@media (width <= 1050px) {
  .editor-grid,
  .comparison-grid {
    grid-template-columns: 1fr;
  }
}
</style>

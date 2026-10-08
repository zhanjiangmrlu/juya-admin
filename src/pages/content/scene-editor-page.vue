<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
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
import {
  parseEditorStage,
  PRODUCTION_STAGES
} from '@/features/content-production/content-production-model'
import ContentProductionNav from '@/features/content-production/content-production-nav.vue'
import SceneAudioPanel from '@/features/content-production/scene-audio-panel.vue'
import SceneDraftPanel from '@/features/content-production/scene-draft-panel.vue'
import SceneOcrPanel from '@/features/content-production/scene-ocr-panel.vue'
import SceneProofreadPanel from '@/features/content-production/scene-proofread-panel.vue'
import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { AudioElement } from '@/features/audio/segment-player'
import type { SceneRevision, SceneSummary } from '@/features/content/content-model'
import type { DialogueRow, LexiconRow } from '@/features/content-editor/scene-form'
import type { ProductionStage } from '@/features/content-production/content-production-model'
import type { OcrQuota } from '@/features/ocr/ocr-adapter'
import type { OcrJob } from '@/features/ocr/ocr-model'
import type { OcrGroup, OcrSuggestions } from '@/features/ocr/ocr-suggestions'
import type { UploadFile } from 'element-plus'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id))
const stage = computed(() => parseEditorStage(route.query.stage))
const stageLabel = computed(
  () => PRODUCTION_STAGES.find((item) => item.stage === stage.value)?.label
)
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
const workspaceBusy = computed(() => state.value !== 'ready' || ocrBusy.value || assetsBusy.value)
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
  selectedAudioVersion.value = form.audio?.version_id ?? ''
}
/** 保存结构化草稿，冲突时保留全部输入。
 * @returns 是否保存成功
 */
async function save(): Promise<boolean> {
  if (!revision.value || state.value !== 'ready' || hasConflict.value || assetsBusy.value)
    return false
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
    selectedAudioVersion.value = version.id
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
  selectedAudioVersion.value = ''
}
/** 打开已保存草稿的设备预览。 */
async function preview(): Promise<void> {
  audioGeneration++
  player.value?.stop()
  if (await save()) showPreview.value = true
}
/**
 * 同场景只切换展示步骤；进入列表或发布前保存当前草稿。
 * @param next - 管理员选择的工作区
 */
async function switchWorkspace(next: ProductionStage): Promise<void> {
  if (workspaceBusy.value || next === stage.value) return
  if (next === 'list' || next === 'publish') {
    if (!(await save()) || !revision.value) return
    await router.push(
      next === 'list'
        ? { name: 'content-scenes' }
        : { name: 'content-scene-publish', params: { id: revision.value.id } }
    )
    return
  }
  audioGeneration++
  player.value?.stop()
  await router.push({ query: { ...route.query, stage: next } })
}
/**
 * 将校对子组件的素材任务状态纳入全页编辑保护。
 * @param section - 词汇或语块区
 * @param value - 是否正在执行素材任务
 */
function setLexiconBusy(section: 'vocabulary' | 'chunks', value: boolean): void {
  lexiconBusy[section] = value
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
    <ContentProductionNav :active="stage" :busy="workspaceBusy" @select="switchWorkspace" />
    <div class="page-heading">
      <div>
        <p class="scene-context">{{ stageLabel }} · {{ scene?.title || sceneId }}</p>
        <p>同一场景草稿按步骤编辑；切换工作区保留输入，预览发布前保存当前版本。</p>
      </div>
      <div class="heading-actions">
        <ElTag v-if="revision" effect="plain" type="warning">草稿 v{{ currentVersion }}</ElTag>
        <ElButton :disabled="workspaceBusy || hasConflict" @click="preview">设备预览</ElButton>
        <ElButton :disabled="workspaceBusy" @click="historyOpened = true">完整版本历史</ElButton>
        <ElButton
          :disabled="workspaceBusy || hasConflict"
          :loading="state === 'saving'"
          type="primary"
          @click="save"
          >保存草稿</ElButton
        >
        <ElButton
          v-if="revision"
          :disabled="workspaceBusy || hasConflict"
          @click="switchWorkspace('publish')"
          >检查发布</ElButton
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
      >
        <template #default
          ><ElButton link @click="load">明确放弃本地内容并重新加载</ElButton></template
        >
      </ElAlert>
      <ElAlert v-else-if="error" :closable="false" :title="error" type="error">
        <template #default
          ><ElButton v-if="state === 'error'" @click="load">重新加载</ElButton></template
        >
      </ElAlert>
      <template v-if="revision">
        <div v-if="stage === 'draft' || stage === 'proofread'" class="editor-grid">
          <SceneDraftPanel
            :form="form"
            :series-title="scene?.seriesTitle ?? ''"
            :image-url="imageUrl"
            :media-busy="mediaBusy"
            @upload="uploadImage"
            @refresh-image="refreshImage"
          />
          <SceneProofreadPanel v-if="stage === 'proofread'" :form="form" @busy="setLexiconBusy" />
          <aside v-else class="draft-aside">
            <ElCard shadow="never" class="entry-panel">
              <template #header><h3>草稿与素材</h3></template>
              <dl class="material-list">
                <div>
                  <dt>原图</dt>
                  <dd>仅授权场景可查看完整原图</dd>
                </div>
                <div>
                  <dt>逐句对话</dt>
                  <dd>可新增、排序、删除</dd>
                </div>
                <div>
                  <dt>词汇与语块</dt>
                  <dd>使用自建词汇库引用</dd>
                </div>
                <div>
                  <dt>整段音频</dt>
                  <dd>上传后逐句标时并核对</dd>
                </div>
              </dl>
              <div class="entry-actions">
                <ElButton type="primary" @click="switchWorkspace('proofread')"
                  >进入内容校对</ElButton
                >
                <ElButton @click="switchWorkspace('ocr')">使用 OCR 辅助识别</ElButton>
              </div>
            </ElCard>
            <ElAlert title="提交前确认" type="success" :closable="false">
              草稿允许不完整，可分次保存；已发布内容修改形成候选版本。
            </ElAlert>
          </aside>
        </div>
        <SceneOcrPanel
          v-if="stage === 'ocr'"
          v-model:selected-fields="selectedFields"
          :form="form"
          :candidate="candidate"
          :quota="quota"
          :job="job"
          :busy="ocrBusy"
          :disabled="hasConflict || assetsBusy"
          :candidate-ready="candidateReady"
          :suggestions="suggestions"
          :accepted-groups="acceptedGroups"
          :raw-lines="rawLines"
          :image-url="imageUrl"
          @start="startOcr"
          @refresh="refreshOcr"
          @assign="assignLine"
          @group="acceptGroup"
          @adopt="adopt"
        />
        <SceneAudioPanel
          v-if="stage === 'audio'"
          :form="form"
          :versions="audioVersions"
          :selected-version="selectedAudioVersion"
          :pending-file="pendingAudioFile"
          :busy="mediaBusy"
          :player="player"
          :can-record="Boolean(audioUrl)"
          @load="loadAudio"
          @upload="uploadAudio"
          @bind="bindAudio"
          @play="playRow"
          @record="recordTime"
          @refresh="loadAudioSource"
          @remove="removeAudio"
          @element="audioElement = $event"
        />
      </template>
    </fieldset>
    <ElDialog v-model="showPreview" title="场景设备预览" width="min(960px, 94vw)">
      <ScenePreview
        v-if="showPreview && revision"
        :content="revision.content"
        :revision-id="revision.id"
      />
    </ElDialog>
    <SceneHistory v-model="historyOpened" :scene-id="sceneId" />
  </section>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
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
  color: var(--juya-color-sidebar);
  font-size: 20px;
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
  grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
  align-items: start;
  gap: 18px;
  margin-top: 14px;
}

.editor-fields {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.entry-panel {
  min-width: 0;
  min-height: 455px;
}

.scene-context {
  margin: 0;
  font-weight: 600;
}

.draft-aside {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.draft-aside > :deep(.el-alert) {
  min-height: 156px;
  padding: 16px;
  border-radius: 16px;
}

.entry-panel :deep(.el-card__header) {
  border-bottom: 0;
}

.material-list {
  display: grid;
  gap: 32px;
  margin: 12px 0 32px;
}

.material-list > div {
  padding-left: 14px;
  border-left: 5px solid var(--juya-color-success);
}

.material-list dt {
  margin-bottom: 5px;
  font-size: 13px;
  font-weight: 700;
}

.material-list dd {
  margin: 0;
  color: var(--juya-color-text-regular);
  font-size: 12px;
}

.entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.entry-actions :deep(.el-button) {
  margin: 0;
}

@media (width <= 1050px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>

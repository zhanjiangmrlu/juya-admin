<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
import ContentCandidatesPanel from '@/features/content-candidates/content-candidates-panel.vue'
import {
  createRevisionController,
  type RevisionController
} from '@/features/content-editor/revision-controller'
import {
  normalizeSceneContent,
  replaceSceneAudio,
  resetSceneContent
} from '@/features/content-editor/scene-form'
import SceneHistory from '@/features/content-editor/scene-history.vue'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { parseEditorStage } from '@/features/content-production/content-production-model'
import SceneAudioPanel from '@/features/content-production/scene-audio-panel.vue'
import SceneDraftPanel from '@/features/content-production/scene-draft-panel.vue'
import SceneProofreadPanel from '@/features/content-production/scene-proofread-panel.vue'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import { resolveWorkOrderContext } from '@/features/content-production/work-order-context'
import { canonical } from '@/features/proofreading/proofreading-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { AudioElement } from '@/features/audio/segment-player'
import type { SceneRevision, SceneSummary } from '@/features/content/content-model'
import type { DialogueRow } from '@/features/content-editor/scene-form'
import type { UploadFile } from 'element-plus'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id))
const stage = computed(() => parseEditorStage(route.query.stage))
const client = useAdminApiClient()
const adapter = createContentAdapter(client)
const production = createWorkOrderAdapter(client)
const media = createSceneMediaAdapter(client)
const audioAdapter = createAudioAdapter(client)
const scene = ref<SceneSummary | null>(null)
const revision = ref<SceneRevision | null>(null)
const controller = shallowRef<RevisionController | null>(null)
const form = reactive(normalizeSceneContent({}))
const wordCard = computed(
  () => scene.value?.templateType === 'word_card' || scene.value?.templateType === 'vocabulary'
)
const state = ref<'error' | 'loading' | 'ready' | 'saving'>('loading')
const error = ref('')
const mediaBusy = ref(false)
const sliceBusy = ref(false)
const candidateBusy = ref(false)
const lexiconBusy = reactive({ vocabulary: false, chunks: false })
const assetsBusy = computed(
  () =>
    mediaBusy.value ||
    sliceBusy.value ||
    candidateBusy.value ||
    lexiconBusy.vocabulary ||
    lexiconBusy.chunks
)
const workspaceBusy = computed(() => state.value !== 'ready' || assetsBusy.value)
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
const currentVersion = computed(() => controller.value?.revision.value ?? 0)
const hasConflict = computed(() => controller.value?.conflict.value ?? false)
const dirty = computed(() => {
  if (!revision.value) return true
  const saved = normalizeSceneContent(revision.value.content)
  saved.template_type = wordCard.value ? 'word_card' : 'dialogue'
  return JSON.stringify(canonical(saved)) !== JSON.stringify(canonical(form))
})
const audioElement = ref<AudioElement | null>(null)
const player = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const audioUrl = ref('')
let audioGeneration = 0
let pageGeneration = 0
let disposed = false

const /** 加载同一场景并恢复工作单上下文 */
  load = async (): Promise<void> => {
    const generation = ++pageGeneration
    const targetId = sceneId.value
    revision.value = null
    scene.value = null
    controller.value = null
    resetSceneContent(form, {})
    state.value = 'loading'
    error.value = ''
    player.value?.stop()
    audioGeneration++
    try {
      const loaded = await adapter.getScene(targetId)
      if (disposed || generation !== pageGeneration) return
      if (!route.query.work_order_id || route.query.stage !== 'audio') {
        if (!loaded.draftRevisionId)
          await adapter.createRevision(loaded.id, loaded.publishedRevisionId)
        const context = await resolveWorkOrderContext(production, {
          content_id: loaded.id,
          series_id: loaded.seriesId,
          content_type:
            loaded.templateType === 'word_card' || loaded.templateType === 'vocabulary'
              ? 'word_card'
              : 'dialogue'
        })
        await router.replace(
          route.query.stage === 'publish'
            ? {
                name: 'content-work-order',
                params: { id: context.orderId },
                query: { view: 'publication' }
              }
            : {
                name: 'content-work-item',
                params: { id: context.orderId, itemId: context.itemId },
                query: {
                  section: ['entries', 'draft'].includes(String(route.query.stage))
                    ? String(route.query.stage)
                    : loaded.templateType === 'word_card' || loaded.templateType === 'vocabulary'
                      ? 'entries'
                      : route.query.stage === 'audio'
                        ? 'audio'
                        : 'content',
                  editor: 'scene'
                }
              }
        )
        return
      }
      scene.value = loaded
      if (!scene.value.draftRevisionId) throw new Error('该场景当前没有可编辑草稿，请先创建草稿')
      const saved = await adapter.getRevision(scene.value.draftRevisionId)
      if (disposed || generation !== pageGeneration) return
      accept(saved)
      state.value = 'ready'
      await refreshImage()
    } catch (failure) {
      if (disposed || generation !== pageGeneration) return
      error.value = message(failure)
      state.value = 'error'
    }
  }
const /** 应用服务端固定版本，刷新服务端生成的词库引用。
   * @param value - 已保存版本
   */
  accept = (value: SceneRevision): void => {
    revision.value = value
    if (!controller.value) controller.value = createRevisionController(value.version, value.content)
    else controller.value.acceptSavedVersion(value.version, value.content)
    resetSceneContent(form, value.content)
    form.template_type = wordCard.value ? 'word_card' : 'dialogue'
    selectedAudioVersion.value = form.audio?.version_id ?? ''
  }
const /** 保存当前候选请求所依赖的草稿版本
   * @returns 可用于请求候选的固定草稿，保存失败时为空
   */
  prepareCandidate = async (): Promise<SceneRevision | null> => {
    if (dirty.value && !(await save())) return null
    return revision.value
  }
const /** 保存结构化草稿，冲突时保留全部输入。
   * @returns 是否保存成功
   */
  save = async (): Promise<boolean> => {
    if (!revision.value || state.value !== 'ready' || hasConflict.value || assetsBusy.value)
      return false
    const generation = pageGeneration
    state.value = 'saving'
    error.value = ''
    try {
      const result = await adapter.saveRevision(
        revision.value.id,
        currentVersion.value,
        normalizeSceneContent({ ...form })
      )
      if (disposed || generation !== pageGeneration) return false
      accept(result)
      ElMessage.success('草稿已保存')
      return true
    } catch (failure) {
      if (disposed || generation !== pageGeneration) return false
      controller.value?.handleSaveFailure(failure)
      error.value = message(failure)
      return false
    } finally {
      if (generation === pageGeneration) state.value = 'ready'
    }
  }
const /**
   * 保存音频页输入后返回所属工作单
   * @param single - 是否返回本篇修正
   */ returnToWorkOrder = async (single: boolean): Promise<void> => {
    const generation = pageGeneration
    if (workspaceBusy.value || hasConflict.value || (dirty.value && !(await save()))) return
    if (disposed || generation !== pageGeneration) return
    await router.push({
      name: single ? 'content-work-item' : 'content-work-order',
      params: {
        id: String(route.query.work_order_id),
        ...(single ? { itemId: String(route.query.work_item_id) } : {})
      },
      query: single
        ? {
            section: String(route.query.return_section || 'content'),
            issue: route.query.return_issue
          }
        : {}
    })
  }
const /**
   * 保存实际本篇输入后确认服务端稳定义项和来源
   * @param section - 当前单词或语块区
   * @param index - 管理员明确确认的本篇条目序号
   */ confirmEntry = async (section: 'vocabulary' | 'chunks', index: number): Promise<void> => {
    const generation = pageGeneration
    if (!(await save()) || !revision.value) return
    if (disposed || generation !== pageGeneration) return
    const revisionId = revision.value.id
    const entry = form[section][index]
    if (!entry?.entry_id) {
      error.value = '条目尚未生成稳定编号，请重新保存草稿'
      return
    }
    state.value = 'saving'
    try {
      await client.request({
        method: 'POST',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/entries/${encodeURIComponent(entry.entry_id)}/confirm`,
        body: { expected_version: currentVersion.value, manual_checked: true }
      })
      const saved = await adapter.getRevision(revisionId)
      if (disposed || generation !== pageGeneration) return
      accept(saved)
      ElMessage.success('本篇义项与来源已确认')
    } catch (failure) {
      if (disposed || generation !== pageGeneration) return
      controller.value?.handleSaveFailure(failure)
      error.value = message(failure)
    } finally {
      if (generation === pageGeneration) state.value = 'ready'
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
    ElMessage.success('原图已上传，可继续编辑内容')
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
const /**
   * 将校对子组件的素材任务状态纳入全页编辑保护。
   * @param section - 词汇或语块区
   * @param value - 是否正在执行素材任务
   */
  setLexiconBusy = (section: 'vocabulary' | 'chunks', value: boolean): void => {
    lexiconBusy[section] = value
  }
/** 返回错误文案。
 * @param failure - 操作异常
 * @returns 用户可读错误
 */
function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : '操作失败'
}
watch(
  () => [sceneId.value, route.fullPath],
  () => void load(),
  { immediate: true }
)
onBeforeUnmount(() => {
  disposed = true
  pageGeneration++
  revision.value = null
  controller.value = null
  audioGeneration++
  player.value?.dispose()
})
</script>
<template>
  <section class="scene-editor-page admin-brand-headings">
    <ElSkeleton v-if="state === 'loading'" :rows="10" animated />
    <fieldset
      v-else
      class="editor-fields"
      :disabled="state === 'saving'"
      :inert="state === 'saving'"
      :aria-busy="state === 'saving'"
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
        <SceneDraftPanel
          v-if="stage === 'draft'"
          :form="form"
          :series-title="scene?.seriesTitle ?? ''"
          :image-url="imageUrl"
          :media-busy="mediaBusy"
          @upload="uploadImage"
          @refresh-image="refreshImage"
        />
        <div v-if="stage === 'proofread' && !wordCard" class="comparison-grid">
          <AdminPanel title="已保存输入 · 只读">
            <ElTag effect="plain">当前草稿快照</ElTag>
            <h3>{{ revision.content.title_en }}｜{{ revision.content.title_zh }}</h3>
            <article
              v-for="(line, index) in normalizeSceneContent(revision.content).dialogue"
              :key="line.id"
              class="source-line"
            >
              <small>第{{ index + 1 }}句 · {{ line.speaker }}</small>
              <p>{{ line.english }}</p>
              <p>{{ line.chinese }}</p>
            </article>
            <p class="source-note">这里对照当前已保存的输入；原始导入文档请从对应批次查看</p>
          </AdminPanel>
          <SceneProofreadPanel
            :form="form"
            mode="dialogue"
            @busy="setLexiconBusy"
            @confirm="confirmEntry"
          />
        </div>
        <template v-if="stage === 'entries' || (stage === 'proofread' && wordCard)">
          <AdminPanel title="来源与候选版本">
            <strong>{{ scene?.title }} · {{ sceneId }} · 候选版本 v{{ currentVersion }}</strong>
            <p>
              保存本篇确认资料，稳定条目和来源位置由系统维护；同词不同意思分别保存，旧收藏快照不随修改更新。
            </p>
          </AdminPanel>
          <SceneProofreadPanel
            :form="form"
            mode="entries"
            @busy="setLexiconBusy"
            @confirm="confirmEntry"
          />
          <AdminPanel title="发音资源 · 词汇与语块共用规则">
            <p>
              优先使用已上传的可用音频；无文件时使用后台确认的合成目标。语块保持完整单位并使用无图列表，适用音标与解释完整保存。
            </p>
          </AdminPanel>
        </template>
        <ElAlert
          v-if="stage === 'proofread' && !wordCard"
          title="校对提示"
          :closable="false"
          type="success"
        >
          系统整理和配对已提交的正文。需要改动文字时由管理员手动编辑并确认，不静默改写或整篇重译。保存配对结果后，重新校对当前候选版本。
        </ElAlert>
        <ContentCandidatesPanel
          v-show="stage === 'candidates'"
          :revision-id="revision.id"
          :expected-version="currentVersion"
          :form="form"
          :dirty="dirty"
          :disabled="workspaceBusy || hasConflict"
          :prepare="prepareCandidate"
          kind="AI_LEXICON"
          @saved="accept"
          @busy="candidateBusy = $event"
        />
        <ContentCandidatesPanel
          v-show="stage === 'audio' && !wordCard"
          :revision-id="revision.id"
          :expected-version="currentVersion"
          :form="form"
          :dirty="dirty"
          :disabled="workspaceBusy || hasConflict"
          :prepare="prepareCandidate"
          kind="ASR_BOUNDARY"
          @saved="accept"
          @busy="candidateBusy = $event"
        />
        <SceneAudioPanel
          v-if="stage === 'audio' && !wordCard"
          :form="form"
          :versions="audioVersions"
          :revision-id="revision.id"
          :expected-version="currentVersion"
          :dirty="dirty"
          :selected-version="selectedAudioVersion"
          :prepare="prepareCandidate"
          :pending-file="pendingAudioFile"
          :busy="assetsBusy"
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
          @saved="accept"
          @slice-busy="sliceBusy = $event"
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
    <AppPageActions>
      <ElButton :disabled="workspaceBusy || hasConflict" @click="returnToWorkOrder(true)"
        >返回本篇修正</ElButton
      >
      <ElButton :disabled="workspaceBusy || hasConflict" @click="preview">手机 / 平板预览</ElButton>
      <ElButton
        :disabled="workspaceBusy || hasConflict"
        :loading="state === 'saving'"
        type="primary"
        @click="save"
        >{{
          stage === 'entries' ? '保存候选资料' : stage === 'proofread' ? '保存配对结果' : '保存草稿'
        }}</ElButton
      >
      <ElButton
        v-if="revision"
        :disabled="workspaceBusy || hasConflict"
        @click="returnToWorkOrder(false)"
        >返回本批校对</ElButton
      >
    </AppPageActions>
    <details class="history-management">
      <summary>完整版本历史与追溯</summary>
      <ElButton :disabled="workspaceBusy" @click="historyOpened = true">查看完整版本历史</ElButton>
    </details>
    <SceneHistory v-model="historyOpened" :scene-id="sceneId" />
  </section>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.source-line {
  padding: 12px 0;
  border-bottom: 1px solid var(--juya-color-border);

  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--juya-color-text-primary);
  }
}

.editor-fields {
  display: grid;
  gap: 20px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.history-management {
  margin-top: 20px;

  summary {
    color: var(--el-color-primary);
    cursor: pointer;
  }
}

@media (width <= 1050px) {
  .comparison-grid {
    grid-template-columns: 1fr;
  }
}
</style>

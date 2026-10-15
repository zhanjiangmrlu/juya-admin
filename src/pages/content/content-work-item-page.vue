<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import SceneDraftPanel from '@/features/content-production/scene-draft-panel.vue'
import ScenePairingPanel from '@/features/content-production/scene-pairing-panel.vue'
import SceneProofreadPanel from '@/features/content-production/scene-proofread-panel.vue'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import {
  correctionDifferences,
  isCorrectionConflict
} from '@/features/content-production/work-order-correction-model'
import { issueFieldLabel } from '@/features/content-production/work-order-model'
import WorkOrderOriginal from '@/features/content-production/work-order-original.vue'
import WorkOrderSourceIssues from '@/features/content-production/work-order-source-issues.vue'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import ShortReadingEditorFields from '@/features/short-reading/short-reading-editor-fields.vue'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
import ShortReadingPreview from '@/features/short-reading/short-reading-preview.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  ProductionSchema as S,
  WorkCandidate,
  WorkItemDetail,
  WorkOrder
} from '@/features/content-production/work-order-model'
import type { UploadFile } from 'element-plus'
const route = useRoute(),
  router = useRouter(),
  client = useAdminApiClient()
const adapter = createWorkOrderAdapter(client),
  media = createSceneMediaAdapter(client),
  readings = createShortReadingAdapter(client)
const order = shallowRef<WorkOrder | null>(null),
  detail = shallowRef<WorkItemDetail | null>(null)
const bindings = shallowRef<S['EntryBindings'] | null>(null)
const scene = ref(normalizeSceneContent({})),
  reading = ref(normalizeShortReading({}))
const busy = ref(false),
  conflict = ref(false),
  error = ref(''),
  compared = ref(false),
  resolved = ref<string[]>([])
const conflictReady = ref(false)
const differences = computed(() =>
  correctionDifferences(
    isReading.value ? reading.value : scene.value,
    detail.value?.current?.content
  )
)
const coverUrl = ref(''),
  audioUrl = ref(''),
  imageUrl = ref('')
const id = computed(() => String(route.params.id)),
  itemId = computed(() => String(route.params.itemId))
const isReading = computed(() => detail.value?.current?.template === 'short_reading')
const wordCard = computed(() => detail.value?.current?.template === 'word_card')
const section = computed(() => String(route.query.section || 'content'))
const pairing = computed(
  () =>
    section.value === 'source' ||
    (!isReading.value && !['entries', 'draft'].includes(section.value))
)
const previewOpened = ref(false)
const saveLabel = computed(() =>
  wordCard.value && section.value !== 'draft'
    ? '保存候选资料'
    : pairing.value
      ? '保存配对结果'
      : isReading.value || section.value === 'draft'
        ? '保存草稿'
        : '保存候选资料'
)
const focusedIssue = computed(() =>
  detail.value?.issues?.find((issue) => issue.id === route.query.issue)
)
const dirty = computed(
  () =>
    JSON.stringify(isReading.value ? reading.value : scene.value) !==
    JSON.stringify(
      isReading.value
        ? normalizeShortReading(detail.value?.current?.content || {})
        : normalizeSceneContent(detail.value?.current?.content || {})
    )
)
const editorRoot = ref<globalThis.HTMLElement | null>(null)
const entryBusy = reactive({ vocabulary: false, chunks: false })
const hasMediaWork = computed(() => entryBusy.vocabulary || entryBusy.chunks)
let resourceGeneration = 0
let routeGeneration = 0
let loadGeneration = 0
let originalAbort: globalThis.AbortController | null = null
const /** 捕获当前页面身份供异步完成时核对
   * @returns 当前身份验证函数
   */ capture = (): (() => boolean) => {
    const token = routeGeneration,
      orderId = id.value,
      workItemId = itemId.value
    return () => token === routeGeneration && orderId === id.value && workItemId === itemId.value
  }
onBeforeUnmount(() => {
  originalAbort?.abort()
  resourceGeneration++
  routeGeneration++
  loadGeneration++
})
const /** 刷新当前版本引用的实际媒体
   */
  resources = async (): Promise<void> => {
    const generation = ++resourceGeneration
    coverUrl.value = ''
    audioUrl.value = ''
    imageUrl.value = ''
    const content = isReading.value ? reading.value : scene.value
    const targets = [
      { asset: content.cover_asset_id, target: coverUrl },
      { asset: content.audio?.asset_id, target: audioUrl },
      { asset: isReading.value ? null : scene.value.original_image_asset_id, target: imageUrl }
    ]
    await Promise.all(
      targets.map(async ({ asset, target }) => {
        if (!asset) return
        try {
          const signed = await media.signedUrl(asset)
          if (generation === resourceGeneration) target.value = signed.url
        } catch (failure) {
          if (generation === resourceGeneration)
            error.value = failure instanceof Error ? failure.message : '素材预览暂不可用，请刷新'
        }
      })
    )
  }
const /** 读取不可变输入和当前候选，冲突时保留输入直到管理员主动重载
   * @param replaceForm - 是否替换当前未保存输入
   * @returns 是否已读取完整候选与身份绑定
   */
  load = async (replaceForm = true): Promise<boolean> => {
    const active = capture(),
      token = ++loadGeneration
    const orderId = id.value,
      workItemId = itemId.value
    const /** 判断异步操作仍属于当前页面身份
       * @returns 当前操作是否有效
       */ current = (): boolean => active() && token === loadGeneration
    try {
      const [currentOrder, item] = await Promise.all([
        adapter.get(orderId),
        adapter.detail(orderId, workItemId)
      ])
      if (!active() || token !== loadGeneration) return false
      const editor =
        item.current?.template === 'short_reading'
          ? 'reading'
          : item.current?.template === 'word_card'
            ? 'word-card'
            : 'scene'
      const targetSection =
        item.current?.template === 'word_card' && !route.query.section
          ? 'entries'
          : route.query.section
      if (
        item.current &&
        (route.query.editor !== editor || targetSection !== route.query.section)
      ) {
        await router.replace({
          query: { ...route.query, editor, ...(targetSection ? { section: targetSection } : {}) }
        })
        return true
      }
      order.value = currentOrder
      detail.value = item
      if (section.value === 'audio' && item.current?.template === 'dialogue' && item.content_id) {
        await router.replace({
          name: 'content-scene-edit',
          params: { id: item.content_id },
          query: {
            stage: 'audio',
            work_order_id: id.value,
            work_item_id: itemId.value,
            return_section: 'content',
            return_issue: route.query.issue
          }
        })
        return true
      }
      if (replaceForm) {
        scene.value = normalizeSceneContent(
          item.current?.template !== 'short_reading' ? item.current?.content || {} : {}
        )
        reading.value = normalizeShortReading(
          item.current?.template === 'short_reading' ? item.current.content : {}
        )
        conflict.value = false
        conflictReady.value = false
        compared.value = false
        resolved.value = []
      }
      const loadedBindings =
        item.revision_id && item.current?.template !== 'short_reading'
          ? await adapter.bindings(orderId, workItemId)
          : null
      if (!current()) return false
      bindings.value = loadedBindings
      if (!replaceForm) conflictReady.value = true
      void resources()
      await nextTick()
      if (!current()) return false
      if (focusedIssue.value) {
        const label = issueFieldLabel(focusedIssue.value.location || [])
        const input = Array.from(
          editorRoot.value?.querySelectorAll<
            globalThis.HTMLInputElement | globalThis.HTMLTextAreaElement
          >('input,textarea') || []
        ).find((element) => label && element.getAttribute('aria-label') === label)
        const disclosure = input?.closest('details')
        if (disclosure) disclosure.open = true
        input?.focus()
      }
      return true
    } catch (failure) {
      if (!current()) return false
      conflictReady.value = false
      error.value = failure instanceof Error ? failure.message : '内容加载失败'
      return false
    }
  }
const /** 保存精确候选和原文问题确认，冲突不自动重试
   * @returns 是否保存成功
   */
  save = async (): Promise<boolean> => {
    if (
      !order.value ||
      !detail.value?.revision_id ||
      !detail.value.candidate_hash ||
      busy.value ||
      hasMediaWork.value ||
      conflict.value
    )
      return false
    const active = capture()
    busy.value = true
    error.value = ''
    try {
      const current: WorkCandidate = isReading.value
        ? {
            template: 'short_reading',
            content: {
              ...reading.value,
              audio: reading.value.audio
                ? {
                    ...reading.value.audio,
                    listening_confirmed: reading.value.audio.listening_confirmed || false
                  }
                : null
            }
          }
        : {
            template: detail.value.current?.template === 'word_card' ? 'word_card' : 'dialogue',
            content: scene.value as S['SceneContent']
          }
      await adapter.correction(id.value, itemId.value, {
        expected_version: order.value.version,
        expected_revision_id: detail.value.revision_id,
        expected_edit_version: detail.value.edit_version!,
        expected_content_version: detail.value.content_version!,
        candidate_hash: detail.value.candidate_hash,
        current,
        original_compared: compared.value,
        resolved_issue_ids: compared.value
          ? resolved.value.filter((issueId) =>
              detail.value?.issues?.some(
                (issue) => issue.id === issueId && issue.acknowledgement_eligible
              )
            )
          : []
      })
      if (!active()) return false
      return await load()
    } catch (failure) {
      if (!active()) return false
      conflict.value = isCorrectionConflict(failure)
      if (conflict.value) {
        conflictReady.value = false
        await load(false)
        if (!active()) return false
        error.value = '当前候选已更新。输入已保留，请与刷新后的候选核对后重新编辑'
      } else {
        error.value =
          failure instanceof ApiError && failure.code === 'MEANING_CHANGE_CONFIRMATION_REQUIRED'
            ? '中文释义已修改，请在对应词条的“释义变化类型”中选择措辞修订或新义项；当前输入已保留'
            : `${failure instanceof Error ? failure.message : '保存结果待核实'}。当前输入已保留，可修正后再次保存`
      }
      return false
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 对照新候选后明确保留本地输入，后续保存才发起写入 */ keepLocal = (): void => {
    if (!conflictReady.value || busy.value) return
    conflict.value = false
    compared.value = false
    resolved.value = []
    error.value = '已保留本地输入，请完成核对后再次保存；尚未写入服务端'
  }
const /** 保存后只确认管理员点选的词条
   * @param section - 单词或语块区
   * @param index - 本篇被明确核对的行
   */ confirmEntry = async (section: 'vocabulary' | 'chunks', index: number): Promise<void> => {
    const active = capture()
    if (!(await save()) || !active() || !detail.value?.revision_id) return
    const entry = scene.value[section][index]
    if (!entry?.entry_id) {
      error.value = '当前词条身份未生成，请重新核对后保存'
      return
    }
    busy.value = true
    try {
      await adapter.confirmEntry(
        detail.value.revision_id,
        entry.entry_id,
        detail.value.edit_version!
      )
      if (!active()) return
      await load()
    } catch (failure) {
      if (!active()) return
      error.value = failure instanceof Error ? failure.message : '本条确认失败，请重新核对'
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 上传并关联当前安全图片
   * @param file - 管理员选择的图片文件
   * @param target - 封面或场景学习图片
   */
  uploadImage = async (file: UploadFile, target: 'cover' | 'original' = 'cover'): Promise<void> => {
    if (!file.raw || busy.value) return
    const active = capture()
    busy.value = true
    try {
      const asset = await media.uploadImage(file.raw)
      if (!active()) return
      if (isReading.value) reading.value.cover_asset_id = asset.id
      else if (target === 'original') scene.value.original_image_asset_id = asset.id
      else scene.value.cover_asset_id = asset.id
      await resources()
    } catch (failure) {
      if (!active()) return
      error.value = failure instanceof Error ? failure.message : '上传失败'
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 复用短文真实全文音频上传并重读工作单候选
   * @param file - 管理员选择的全文音频
   */
  uploadAudio = async (file: UploadFile): Promise<void> => {
    const active = capture()
    if (!file.raw || !detail.value?.content_id || !(await save()) || !active()) return
    busy.value = true
    try {
      const snapshot = await readings.load(detail.value.content_id)
      if (!active()) return
      await readings.uploadAudio(snapshot, file.raw, createIdempotencyKey())
      if (!active()) return
      await load()
    } catch (failure) {
      if (!active()) return
      error.value = failure instanceof Error ? failure.message : '音频上传失败'
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 保存后前往复用的场景音频工具，并保留本工作单上下文
   */
  audioEditor = async (): Promise<void> => {
    const active = capture()
    if (!detail.value?.content_id || !(await save()) || !active()) return
    await router.push({
      name: 'content-scene-edit',
      params: { id: detail.value.content_id },
      query: {
        stage: 'audio',
        work_order_id: id.value,
        work_item_id: itemId.value,
        return_section: section.value,
        return_issue: route.query.issue
      }
    })
  }
const /** 明确确认本篇词条与发音目标
   */
  confirmEntries = async (): Promise<void> => {
    const active = capture()
    if (!(await save()) || !active() || !order.value) return
    busy.value = true
    try {
      await adapter.command(id.value, 'entry-confirmations', {
        expected_version: order.value.version,
        scope: 'selected',
        selected_item_ids: [itemId.value],
        manual_confirmed: true
      })
      if (!active()) return
      await load()
    } catch (failure) {
      if (!active()) return
      error.value = failure instanceof Error ? failure.message : '确认失败，请核对本篇词条'
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 保存当前修正后回到同单实际准备结果，由管理员继续开始校对 */ listening =
    async (): Promise<void> => {
      const active = capture()
      if (!(await save()) || !active()) return
      await router.push({
        name: 'content-work-order',
        params: { id: id.value },
        query: { view: 'overview' }
      })
    }
const /** 返回同一工作单的待处理问题
   */
  back = (): void => {
    void router.push({ name: 'content-work-order', params: { id: id.value } })
  }
const /** 保存当前候选后切换同一工作单成员的职责页面
   * @param target - 正文配对、元信息或本篇词条分区
   */ editSection = async (target: string): Promise<void> => {
    const active = capture()
    if (
      ((dirty.value || (compared.value && resolved.value.length)) && !(await save())) ||
      !active()
    )
      return
    await router.push({
      name: 'content-work-item',
      params: { id: id.value, itemId: itemId.value },
      query: { ...route.query, section: target }
    })
  }
const /** 下载实际原始文件，忽略取消请求和离开篇目后的迟到响应 */ downloadOriginal =
    async (): Promise<void> => {
      const active = capture(),
        requestController = new globalThis.AbortController()
      try {
        originalAbort?.abort()
        originalAbort = requestController
        const blob = await adapter.originalFile(id.value, requestController.signal)
        if (requestController.signal.aborted || !active()) return
        const url = globalThis.URL.createObjectURL(blob),
          link = globalThis.document.createElement('a')
        link.href = url
        link.download = order.value?.source_mode === 'DOCX' ? 'original.docx' : 'original.zip'
        link.click()
        globalThis.URL.revokeObjectURL(url)
      } catch (failure) {
        if (!requestController.signal.aborted && active())
          error.value = failure instanceof Error ? failure.message : '原文件下载失败'
      }
    }
watch(
  () => JSON.stringify([scene.value, reading.value]),
  () => {
    compared.value = false
    resolved.value = []
  },
  { flush: 'sync' }
)
watch(
  () => [id.value, itemId.value, route.fullPath],
  () => {
    routeGeneration++
    loadGeneration++
    resourceGeneration++
    order.value = null
    originalAbort?.abort()
    previewOpened.value = false
    detail.value = null
    bindings.value = null
    scene.value = normalizeSceneContent({})
    reading.value = normalizeShortReading({})
    coverUrl.value = audioUrl.value = imageUrl.value = ''
    busy.value = conflict.value = compared.value = conflictReady.value = false
    entryBusy.vocabulary = entryBusy.chunks = false
    resolved.value = []
    error.value = ''
    void load()
  },
  { immediate: true, flush: 'sync' }
)
</script>
<template>
  <section ref="editorRoot" class="work-item-page" data-source-scope>
    <div class="heading">
      <h2>{{ detail?.title_en || detail?.title_zh || '本批内容修正' }}</h2>
      <div v-if="detail?.current" class="editor-navigation">
        <ElButton
          v-if="!pairing"
          :disabled="busy || conflict || hasMediaWork"
          @click="editSection('source')"
          >正文对照与配对校对</ElButton
        >
        <ElButton
          v-if="isReading && pairing"
          :disabled="busy || conflict"
          @click="editSection('content')"
          >返回短文编辑</ElButton
        >
        <template v-if="!isReading">
          <ElButton
            v-if="section !== 'draft'"
            :disabled="busy || conflict || hasMediaWork"
            @click="editSection('draft')"
            >内容基本信息</ElButton
          >
          <ElButton
            v-if="section !== 'entries'"
            :disabled="busy || conflict || hasMediaWork"
            @click="editSection('entries')"
            >{{ wordCard ? '本篇词条资料' : '场景词汇与语块资料' }}</ElButton
          >
        </template>
      </div>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <AdminPanel v-if="conflict" title="保存冲突 · 核对双方差异">
      <p>
        左侧为保留的本地输入，右侧为服务端当前候选。继续编辑不会自动保存；请明确决定保留哪一侧。
      </p>
      <div v-for="difference in differences" :key="difference.field" class="conflict-row">
        <strong>{{ difference.label }}</strong>
        <p>{{ difference.local }}</p>
        <p>{{ difference.remote }}</p>
      </div>
      <p v-if="!differences.length">
        可见正文相同，但候选身份或媒体可能已变化，请重新核对实际素材。
      </p>
      <ElButton :disabled="busy" @click="load(false)">重新读取服务端候选</ElButton>
      <ElButton :disabled="busy || !conflictReady" @click="keepLocal"
        >已对照差异，保留本地输入继续编辑</ElButton
      >
      <ElButton :disabled="busy" @click="load()">放弃本地输入，使用服务端候选</ElButton>
    </AdminPanel>
    <WorkOrderSourceIssues
      v-if="detail?.issues?.length"
      :issues="detail.issues"
      :item-id="detail.item_id"
      :source-visible="pairing"
      :snapshot="detail.source_available ? detail.source_snapshot : null"
      :sentences="pairing && !isReading ? scene.dialogue : []"
      :editable="!!detail.current"
      @edit="editSection('entries')"
    />
    <template v-if="detail"
      ><div :class="{ comparison: pairing }">
        <WorkOrderOriginal
          v-if="pairing"
          :snapshot="detail.source_available ? detail.source_snapshot || null : null"
        />
        <fieldset class="candidate" :disabled="busy || conflict">
          <template v-if="detail.current"
            ><ShortReadingEditorFields
              v-if="isReading"
              v-model="reading"
              :disabled="conflict"
              :busy="busy"
              :cover-url="coverUrl"
              :audio-url="audioUrl"
              :audio-disabled="false"
              :formal-listening="true"
              :body-only="pairing"
              @listening="listening"
              @cover="uploadImage"
              @audio="uploadAudio"
              @refresh="resources"
              @remove-audio="reading.audio = null"
            /><template v-else>
              <ScenePairingPanel
                v-if="pairing && !wordCard"
                :key="`${detail.item_id}:${detail.revision_id}:${detail.candidate_hash}`"
                v-model="scene.dialogue"
                :snapshot="detail.source_available ? detail.source_snapshot || null : null"
              />
              <SceneDraftPanel
                v-if="section === 'draft'"
                :form="scene"
                :series-title="order?.series_title || ''"
                :image-url="imageUrl"
                :cover-url="coverUrl"
                :media-busy="busy"
                @upload="uploadImage($event, 'original')"
                @cover="uploadImage"
                @refresh-image="resources"
              />
              <AdminPanel
                v-if="section === 'entries'"
                :title="`${scene.title_zh || scene.title_en} · ${detail.content_id || ''} · 候选版本 ${detail.edit_version}`"
              >
                <p>稳定条目与来源位置由系统维护；本篇资料保存后校对，已发布快照不会修改。</p>
              </AdminPanel>
              <SceneProofreadPanel
                v-if="!pairing || wordCard"
                :form="scene"
                :mode="section === 'entries' || wordCard ? 'entries' : 'dialogue'"
                @busy="(area, value) => (entryBusy[area] = value)"
                @confirm="confirmEntry"
              />
              <AdminPanel v-if="section === 'entries'" title="发音资源 · 词汇与语块共用规则">
                <p>
                  优先使用已上传的可用音频；无文件时使用后台确认的合成目标。语块保持完整单位并使用无图列表，适用音标与解释完整保存。
                </p>
                <p>无可用文件且不可合成时，用户端隐藏发音按钮。</p>
              </AdminPanel>
              <ElButton
                v-if="!pairing && detail.current.template === 'dialogue'"
                :disabled="busy || conflict || hasMediaWork"
                @click="audioEditor"
                >整段音频、句子边界与切片</ElButton
              ><ElButton
                v-if="section === 'entries'"
                :disabled="busy || conflict || hasMediaWork"
                @click="confirmEntries"
                >已逐条核对本篇词义、来源与发音</ElButton
              ></template
            ></template
          ><AdminPanel v-else title="需要补充源文件"
            ><p>本篇尚未保存为可编辑草稿。请修正上传文件中的问题，重新导入；原工作单保留供对照。</p>
            <ElButton
              @click="
                router.push({
                  name: 'content-import',
                  query: { series_id: order?.series_id, content_type: order?.content_type }
                })
              "
              >补充源文件</ElButton
            ></AdminPanel
          >
        </fieldset>
      </div>
      <ElAlert v-if="pairing" title="校对提示" type="success" :closable="false"
        >系统整理和配对已提交的正文。需要改动文字时由管理员手动编辑并确认，不静默改写或整篇重译。</ElAlert
      >
      <AdminPanel v-if="detail.current && detail.issues?.length" title="本次处理的问题"
        ><ElCheckbox v-if="pairing" v-model="compared" :disabled="!detail.source_available">{{
          wordCard ? '已对照不可变原文，核对本篇词条与来源' : '已对照不可变原文，核对本次正文与配对'
        }}</ElCheckbox
        ><ElCheckboxGroup v-if="pairing" v-model="resolved"
          ><ElCheckbox
            v-for="issue in detail.issues.filter((row) => row.acknowledgement_eligible)"
            :key="issue.id"
            :value="issue.id"
            :disabled="!compared"
            >已处理：{{ issue.message }}</ElCheckbox
          ></ElCheckboxGroup
        ></AdminPanel
      ><AppPageActions
        ><ElButton @click="back">保留待校对</ElButton
        ><ElButton v-if="pairing && order?.import_batch_id" @click="downloadOriginal"
          >查看原文件</ElButton
        ><ElButton :disabled="busy || conflict || hasMediaWork" @click="previewOpened = true"
          >手机 / 平板预览</ElButton
        ><ElButton
          v-if="detail.current"
          :type="isReading && !pairing ? 'default' : 'primary'"
          :disabled="busy || conflict || hasMediaWork"
          @click="save"
          >{{ saveLabel }}</ElButton
        ><ElButton
          v-if="isReading && !pairing"
          type="primary"
          :disabled="busy || conflict"
          @click="listening"
          >预览与发布检查</ElButton
        ></AppPageActions
      ></template
    >
    <ElDialog v-model="previewOpened" title="当前候选设备预览" width="min(960px, 94vw)">
      <ShortReadingPreview
        v-if="previewOpened && isReading"
        device-preview
        :content="reading"
        :cover-url="coverUrl"
        :audio-url="audioUrl"
      />
      <ScenePreview
        v-else-if="previewOpened && detail?.revision_id"
        :content="scene"
        :revision-id="detail.revision_id"
      />
    </ElDialog>
  </section>
</template>
<style scoped lang="scss">
.work-item-page {
  display: grid;
  gap: 20px;

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;

    h2 {
      font-size: 20px;
      margin: 0;
      color: var(--juya-color-sidebar);
    }
  }

  .editor-navigation {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: start;

    :deep(.original-document) {
      position: sticky;
      top: 0;
      max-height: calc(100vh - 190px);
      overflow: auto;
    }

    :deep(.reading-grid),
    :deep(.entries-grid) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .candidate {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .conflict-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) repeat(2, minmax(0, 2fr));
    gap: 12px;
    border-bottom: 1px solid var(--juya-color-border);

    p {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 220px;
    object-fit: contain;
    margin: 12px 0;
  }

  @media (width <= 1050px) {
    .comparison {
      grid-template-columns: 1fr;
    }
  }
}
</style>

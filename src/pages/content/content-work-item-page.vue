<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import SceneProofreadPanel from '@/features/content-production/scene-proofread-panel.vue'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import {
  correctionDifferences,
  isCorrectionConflict
} from '@/features/content-production/work-order-correction-model'
import { issueFieldLabel } from '@/features/content-production/work-order-model'
import WorkOrderOriginal from '@/features/content-production/work-order-original.vue'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import ShortReadingEditorFields from '@/features/short-reading/short-reading-editor-fields.vue'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
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
const section = computed(() => String(route.query.section || 'content'))
const focusedIssue = computed(() =>
  detail.value?.issues?.find((issue) => issue.id === route.query.issue)
)
const editorRoot = ref<globalThis.HTMLElement | null>(null)
const entryBusy = reactive({ vocabulary: false, chunks: false })
const hasMediaWork = computed(() => entryBusy.vocabulary || entryBusy.chunks)
let resourceGeneration = 0
onBeforeUnmount(() => {
  resourceGeneration++
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
    try {
      const [current, item] = await Promise.all([
        adapter.get(id.value),
        adapter.detail(id.value, itemId.value)
      ])
      order.value = current
      detail.value = item
      if (section.value === 'audio' && item.current?.template === 'dialogue' && item.content_id) {
        await router.replace({
          name: 'content-scene-edit',
          params: { id: item.content_id },
          query: { stage: 'audio', work_order_id: id.value, work_item_id: itemId.value }
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
      if (item.revision_id) bindings.value = await adapter.bindings(id.value, itemId.value)
      if (!replaceForm) conflictReady.value = true
      void resources()
      await nextTick()
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
        resolved_issue_ids: compared.value ? resolved.value : []
      })
      return await load()
    } catch (failure) {
      conflict.value = isCorrectionConflict(failure)
      if (conflict.value) {
        conflictReady.value = false
        await load(false)
        error.value = '当前候选已更新。输入已保留，请与刷新后的候选核对后重新编辑'
      } else {
        error.value =
          failure instanceof ApiError && failure.code === 'MEANING_CHANGE_CONFIRMATION_REQUIRED'
            ? '中文释义已修改，请在对应词条的“释义变化类型”中选择措辞修订或新义项；当前输入已保留'
            : `${failure instanceof Error ? failure.message : '保存结果待核实'}。当前输入已保留，可修正后再次保存`
      }
      return false
    } finally {
      busy.value = false
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
    if (!(await save()) || !detail.value?.revision_id) return
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
      await load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '本条确认失败，请重新核对'
    } finally {
      busy.value = false
    }
  }
const /** 上传并关联当前安全图片
   * @param file - 管理员选择的图片文件
   * @param target - 封面或场景学习图片
   */
  uploadImage = async (file: UploadFile, target: 'cover' | 'original' = 'cover'): Promise<void> => {
    if (!file.raw || busy.value) return
    busy.value = true
    try {
      const asset = await media.uploadImage(file.raw)
      if (isReading.value) reading.value.cover_asset_id = asset.id
      else if (target === 'original') scene.value.original_image_asset_id = asset.id
      else scene.value.cover_asset_id = asset.id
      await resources()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '上传失败'
    } finally {
      busy.value = false
    }
  }
const /** 复用短文真实全文音频上传并重读工作单候选
   * @param file - 管理员选择的全文音频
   */
  uploadAudio = async (file: UploadFile): Promise<void> => {
    if (!file.raw || !detail.value?.content_id || !(await save())) return
    busy.value = true
    try {
      const snapshot = await readings.load(detail.value.content_id)
      await readings.uploadAudio(snapshot, file.raw, createIdempotencyKey())
      await load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '音频上传失败'
    } finally {
      busy.value = false
    }
  }
const /** 保存后前往复用的场景音频工具，并保留本工作单上下文
   */
  audioEditor = async (): Promise<void> => {
    if (!detail.value?.content_id || !(await save())) return
    await router.push({
      name: 'content-scene-edit',
      params: { id: detail.value.content_id },
      query: { stage: 'audio', work_order_id: id.value, work_item_id: itemId.value }
    })
  }
const /** 明确确认本篇词条与发音目标
   */
  confirmEntries = async (): Promise<void> => {
    if (!(await save()) || !order.value) return
    busy.value = true
    try {
      await adapter.command(id.value, 'entry-confirmations', {
        expected_version: order.value.version,
        scope: 'selected',
        selected_item_ids: [itemId.value],
        manual_confirmed: true
      })
      await load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '确认失败，请核对本篇词条'
    } finally {
      busy.value = false
    }
  }
const /** 返回同一工作单的待处理问题
   */
  back = (): void => {
    void router.push({ name: 'content-work-order', params: { id: id.value } })
  }
watch(
  () => [id.value, itemId.value],
  () => void load(),
  { immediate: true }
)
</script>
<template>
  <section ref="editorRoot" class="work-item-page">
    <div class="heading">
      <h2>{{ detail?.title_en || detail?.title_zh || '本批内容修正' }}</h2>
      <ElButton @click="back">返回本批问题</ElButton>
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
    <ElAlert v-if="focusedIssue" :title="focusedIssue.message" type="warning" :closable="false" />
    <template v-if="detail"
      ><div class="comparison">
        <WorkOrderOriginal
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
              @cover="uploadImage"
              @audio="uploadAudio"
              @refresh="resources"
              @remove-audio="reading.audio = null"
            /><template v-else
              ><AdminPanel title="本篇元信息"
                ><ElForm label-position="top"
                  ><ElFormItem label="英文标题"
                    ><ElInput v-model="scene.title_en" aria-label="英文标题" /></ElFormItem
                  ><ElFormItem label="中文标题"
                    ><ElInput v-model="scene.title_zh" aria-label="中文标题" /></ElFormItem
                  ><ElFormItem label="简介"
                    ><ElInput v-model="scene.summary" type="textarea" /></ElFormItem
                  ><ElFormItem label="来源"><ElInput v-model="scene.source" /></ElFormItem
                  ><ElFormItem label="版权说明"
                    ><ElInput v-model="scene.copyright" type="textarea" /></ElFormItem></ElForm
                ><ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/*"
                  :disabled="busy"
                  @change="uploadImage"
                  ><ElButton>上传 / 替换封面</ElButton></ElUpload
                ><img v-if="coverUrl" :src="coverUrl" alt="本篇封面" /><ElUpload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/*"
                  :disabled="busy"
                  @change="uploadImage($event, 'original')"
                  ><ElButton>上传 / 替换学习图片</ElButton></ElUpload
                ><img v-if="imageUrl" :src="imageUrl" alt="学习图片" /></AdminPanel
              ><SceneProofreadPanel
                :form="scene"
                :mode="section === 'entries' ? 'entries' : 'all'"
                @busy="(area, value) => (entryBusy[area] = value)"
                @confirm="confirmEntry"
              /><ElButton
                v-if="detail.current.template === 'dialogue'"
                :disabled="busy || conflict || hasMediaWork"
                @click="audioEditor"
                >整段音频、句子边界与切片</ElButton
              ><ElButton :disabled="busy || conflict || hasMediaWork" @click="confirmEntries"
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
      <AdminPanel v-if="detail.current && detail.issues?.length" title="本次处理的问题"
        ><ElCheckbox v-model="compared" :disabled="!detail.source_available"
          >已对照不可变原文，核对本次正文与配对</ElCheckbox
        ><ElCheckboxGroup v-model="resolved"
          ><ElCheckbox
            v-for="issue in detail.issues.filter((row) =>
              ['content', 'source'].includes(row.correction_target)
            )"
            :key="issue.id"
            :value="issue.id"
            :disabled="!compared"
            >已处理：{{ issue.message }}</ElCheckbox
          ></ElCheckboxGroup
        ></AdminPanel
      ><AppPageActions
        ><ElButton @click="back">保留待校对</ElButton
        ><ElButton
          v-if="detail.current"
          type="primary"
          :disabled="busy || conflict || hasMediaWork"
          @click="save"
          >保存候选修正</ElButton
        ></AppPageActions
      ></template
    >
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

    h2 {
      font-size: 20px;
      margin: 0;
      color: var(--juya-color-sidebar);
    }
  }

  .comparison {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
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

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
import ShortReadingPreview from '@/features/short-reading/short-reading-preview.vue'

import type { WorkCommandFields } from './work-order-adapter'
import type { ProductionSchema as S, WorkItemDetail } from './work-order-model'
import type { SampleResource } from './work-order-sample-media'

import { sampleIdentity, sampleResources } from './work-order-sample-media'
const props = defineProps<{
  state: S['SamplingState']
  items: { item_id: string; revision_id?: string | null; title_en?: string; title_zh?: string }[]
  busy: boolean
  detail?: WorkItemDetail | null
  resources?: SampleResource[]
}>()
const emit = defineEmits<{
  inspect: [itemId: string]
  action: [fields: WorkCommandFields<'sample-actions'>]
  edit: [itemId: string]
}>()
const selected = ref('')
const affected = ref<string[]>([])
const affectedIds = computed(() => [
  ...new Set([...(item.value ? [item.value.item_id] : []), ...affected.value])
])
const frozenItems = computed(() =>
  props.items.filter((row) =>
    props.state.candidates.some((candidate) => candidate.revision_id === row.revision_id)
  )
)
const checked = reactive({ text: false, images: false, audio: false, played: false, normal: false })
const played = ref<string[]>([])
const current = computed(() =>
  props.state.candidates.find((row) => row.revision_id === selected.value)
)
const item = computed(() => props.items.find((row) => row.revision_id === selected.value))
const activeDetail = computed(() =>
  props.detail?.item_id === item.value?.item_id &&
  props.detail?.revision_id === selected.value &&
  props.detail?.candidate_hash === current.value?.candidate_hash
    ? props.detail
    : null
)
const required = computed(() => (activeDetail.value ? sampleResources(activeDetail.value) : []))
const resources = computed(() =>
  (props.resources || []).filter(
    (row) =>
      activeDetail.value &&
      row.identity === sampleIdentity(activeDetail.value) &&
      required.value.some((target) => target.key === row.key)
  )
)
const hasAudio = computed(() => required.value.some((row) => row.kind === 'audio'))
const hasImages = computed(() => required.value.some((row) => row.kind === 'image'))
const mediaReady = computed(() =>
  required.value.every((row) =>
    resources.value.some((loaded) => loaded.key === row.key && loaded.url && !loaded.error)
  )
)
const allPlayed = computed(() =>
  required.value
    .filter((row) => row.kind === 'audio')
    .every((row) => played.value.includes(row.key))
)
/**
 * 只接收当前固定资源的实际播放事件
 * @param resource - 触发播放的资源快照
 */
const recordPlay = (resource: SampleResource): void => {
  if (!resources.value.includes(resource) || !resource.url || resource.error) return
  played.value = [...new Set([...played.value, resource.key])]
}
const allSamplesChecked = computed(() =>
  props.state.sample_ids.every((id) => props.state.confirmed_revision_ids.includes(id))
)
const canConfirm = computed(
  () =>
    !!activeDetail.value &&
    mediaReady.value &&
    checked.text &&
    (!hasAudio.value || (checked.audio && allPlayed.value)) &&
    (!hasImages.value || checked.images)
)
/**
 * 打开工作单内当前样本并重置本篇检查
 * @param revisionId - 服务端样本固定版本
 */
const select = (revisionId: string): void => {
  selected.value = revisionId
  played.value = []
  Object.assign(checked, { text: false, images: false, audio: false, played: false })
}
watch(
  () =>
    JSON.stringify([
      props.state.proofreading_set_id,
      props.state.collection_hash,
      props.state.sample_ids,
      props.state.candidates.map((row) => [row.revision_id, row.candidate_hash])
    ]),
  () => {
    checked.normal = false
    affected.value = []
    if (!props.state.candidates.some((row) => row.revision_id === selected.value))
      select(props.state.sample_ids[0] || props.state.candidates[0]?.revision_id || '')
  },
  { immediate: true }
)
watch(
  () => [
    item.value?.item_id,
    current.value?.candidate_hash,
    props.state.collection_hash,
    props.state.proofreading_set_id
  ],
  () => {
    Object.assign(checked, { text: false, images: false, audio: false, played: false })
    played.value = []
    if (item.value) emit('inspect', item.value.item_id)
  },
  { immediate: true }
)
watch(
  () => props.resources,
  () => {
    played.value = []
    checked.audio = false
    checked.images = false
  }
)
/** 确认当前实际检查记录 */
const confirm = (): void => {
  if (!canConfirm.value || !item.value || !current.value) return
  emit('action', {
    operation: 'confirm',
    scope: 'selected',
    selected_item_ids: [item.value.item_id],
    candidate_hash: current.value.candidate_hash,
    text_checked: checked.text,
    images_checked: checked.images,
    audio_listened: checked.audio
  })
}
/**
 * 将选定同类问题篇目移出正常集合
 * @returns 触发异常范围分类
 */
const fail = (): void =>
  emit('action', {
    operation: 'fail',
    scope: 'selected',
    selected_item_ids: affectedIds.value,
    observed_item_id: item.value?.item_id,
    candidate_hash: current.value?.candidate_hash,
    collection_hash: props.state.collection_hash,
    error_code: 'MANUAL_REVIEW_REQUIRED'
  })
</script>
<template>
  <div class="sampling-workspace">
    <div class="metrics">
      <span
        >本次正常 <b>{{ state.normal_count }}</b></span
      ><span>所需样本 {{ state.sample_ids.length }}</span
      ><span
        >已检查样本
        {{
          state.sample_ids.filter((id) => state.confirmed_revision_ids.includes(id)).length
        }}</span
      ><span>当前范围 {{ state.candidates.length }} 篇</span>
    </div>
    <div class="split">
      <AdminPanel title="当前样本"
        ><ElSelect :model-value="selected" aria-label="工作单内篇目" @update:model-value="select"
          ><ElOption
            v-for="row in state.candidates"
            :key="row.revision_id"
            :value="row.revision_id"
            :label="`${items.find((item) => item.revision_id === row.revision_id)?.title_en || items.find((item) => item.revision_id === row.revision_id)?.title_zh || '本批篇目'}${state.sample_ids.includes(row.revision_id) ? ' · 样本' : ''}${state.confirmed_revision_ids.includes(row.revision_id) ? ' · 已检查' : ''}`"
        /></ElSelect>
        <template v-if="activeDetail?.current"
          ><ShortReadingPreview
            v-if="activeDetail.current.template === 'short_reading'"
            :content="normalizeShortReading(activeDetail.current.content)"
            :cover-url="
              resources.find(
                (row) => row.resourceId === activeDetail?.current?.content.cover_asset_id
              )?.url
            "
          /><ScenePreview
            v-else
            :key="sampleIdentity(activeDetail)"
            :content="activeDetail.current.content"
            :revision-id="activeDetail.revision_id || ''"
          />
          <p v-if="hasAudio">抽样必检媒体：请在以下播放器逐个试听，再明确确认。</p>
          <div
            v-for="resource in resources"
            :key="`${resource.identity}:${resource.key}:${resource.url}`"
            class="sample-resource"
          >
            <p>{{ resource.label }}</p>
            <audio
              v-if="resource.kind === 'audio' && resource.url"
              controls
              :src="resource.url"
              :aria-label="resource.label"
              @play="recordPlay(resource)"
            />
            <img
              v-if="resource.kind === 'image' && resource.url"
              :src="resource.url"
              :alt="resource.label"
            />
            <p v-if="resource.error">{{ resource.error }}</p>
          </div>
          <p v-if="!mediaReady">本篇媒体尚未全部加载成功，不能确认检查。</p>
          <ElButton v-if="required.length && item" @click="emit('inspect', item.item_id)"
            >重新读取本篇媒体</ElButton
          ></template
        >
        <ElButton v-if="item" link @click="emit('edit', item.item_id)">打开本篇修正</ElButton>
      </AdminPanel>
      <AdminPanel title="明确检查与抽样确认"
        ><p>
          样本由服务端从本工作单范围选取，可增加样本。发现问题后，将实际受影响篇目保留为待校对草稿。
        </p>
        <ElCheckbox v-model="checked.text">已核对完整中英文、人物与顺序、排版</ElCheckbox
        ><ElCheckbox v-if="hasImages" v-model="checked.images" :disabled="!mediaReady"
          >已核对本篇图片</ElCheckbox
        ><ElCheckbox
          v-if="hasAudio"
          v-model="checked.audio"
          :disabled="!mediaReady || !allPlayed"
          >{{
            activeDetail?.current?.template === 'word_card'
              ? '已逐个试听本篇固定发音'
              : '已逐个试听当前音频、独立发音与句子边界'
          }}</ElCheckbox
        >
        <div class="actions">
          <ElButton type="primary" :disabled="busy || !canConfirm" @click="confirm"
            >确认已检查本篇</ElButton
          ><ElButton
            v-if="item && !state.sample_ids.includes(selected)"
            :disabled="busy"
            @click="
              emit('action', {
                operation: 'append',
                scope: 'selected',
                selected_item_ids: [item.item_id]
              })
            "
            >追加为样本</ElButton
          >
        </div>
        <ElSelect
          v-model="affected"
          multiple
          placeholder="选择同类问题受影响篇目（始终包含当前检查篇目）"
          ><ElOption
            v-for="row in frozenItems"
            :key="row.item_id"
            :value="row.item_id"
            :label="row.title_en || row.title_zh || '本批篇目'"
        /></ElSelect>
        <p v-if="item">
          本次明确标记 {{ affectedIds.length }} 篇：{{
            frozenItems
              .filter((row) => affectedIds.includes(row.item_id))
              .map((row) => row.title_en || row.title_zh || '本批篇目')
              .join('、')
          }}
        </p>
        <p v-if="state.candidates.some((row) => row.failure)">
          已标记需校对：{{
            frozenItems
              .filter((row) =>
                state.candidates.some(
                  (candidate) => candidate.revision_id === row.revision_id && candidate.failure
                )
              )
              .map((row) => row.title_en || row.title_zh || '本批篇目')
              .join('、')
          }}。请逐项复核；修正后按当前草稿重新建立抽样。
        </p>
        <ElButton :disabled="busy || !item" @click="fail">标记所选篇目需校对</ElButton></AdminPanel
      >
    </div>
    <AdminPanel title="确认正常范围"
      ><ElCheckbox v-model="checked.normal" :disabled="!allSamplesChecked"
        >已完成本批所有样本检查，确认其余正常结果；异常项继续保留草稿</ElCheckbox
      >
      <div class="actions">
        <ElButton
          :disabled="busy || !allSamplesChecked || !checked.normal"
          @click="
            emit('action', {
              operation: 'bulk-confirm',
              scope: 'normal',
              collection_hash: state.collection_hash,
              accept_normal_results: true
            })
          "
          >批量确认正常结果</ElButton
        ><ElButton
          :disabled="busy || !allSamplesChecked"
          type="primary"
          @click="
            emit('action', {
              operation: 'complete',
              collection_hash: state.collection_hash,
              allow_abnormal_drafts: true
            })
          "
          >完成校对，预览合格范围</ElButton
        >
      </div></AdminPanel
    >
  </div>
</template>
<style scoped lang="scss">
.sampling-workspace {
  display: grid;
  gap: 20px;

  .metrics {
    display: flex;
    gap: 24px;
    padding: 20px;
    background: var(--juya-color-surface);
    border-radius: 18px;
    flex-wrap: wrap;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr);
    gap: 16px;
  }

  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 16px 0;
  }

  audio {
    width: 100%;
    margin-top: 16px;
  }

  .sample-resource img {
    max-width: 100%;
    max-height: 240px;
    object-fit: contain;
  }

  p {
    line-height: 1.8;
  }

  @media (width <= 1000px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
}
</style>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
import ShortReadingPreview from '@/features/short-reading/short-reading-preview.vue'

import type { ProductionSchema as S, WorkItemDetail } from './work-order-model'
const props = defineProps<{
  state: S['SamplingState']
  items: { item_id: string; revision_id?: string | null; title_en?: string; title_zh?: string }[]
  busy: boolean
  detail?: WorkItemDetail | null
  audioUrl?: string
  coverUrl?: string
}>()
const emit = defineEmits<{
  inspect: [itemId: string]
  action: [fields: Partial<S['SampleActionRequest']>]
  edit: [itemId: string]
}>()
const selected = ref('')
const affected = ref<string[]>([])
const checked = reactive({ text: false, images: false, audio: false, played: false, normal: false })
const current = computed(() =>
  props.state.candidates.find((row) => row.revision_id === selected.value)
)
const item = computed(() => props.items.find((row) => row.revision_id === selected.value))
const hasAudio = computed(() => !!props.detail?.current?.content.audio)
const hasImages = computed(
  () =>
    !!props.detail?.current?.content.cover_asset_id ||
    (props.detail?.current?.template !== 'short_reading' &&
      !!props.detail?.current?.content.original_image_asset_id)
)
const allSamplesChecked = computed(() =>
  props.state.sample_ids.every((id) => props.state.confirmed_revision_ids.includes(id))
)
const canConfirm = computed(
  () =>
    !!props.detail &&
    props.detail.revision_id === selected.value &&
    checked.text &&
    (!hasAudio.value || (checked.audio && checked.played)) &&
    (!hasImages.value || checked.images)
)
const /** 打开工作单内当前样本并重置本篇检查
   * @param revisionId - 服务端样本固定版本
   */
  select = (revisionId: string): void => {
    selected.value = revisionId
    Object.assign(checked, { text: false, images: false, audio: false, played: false })
  }
watch(
  () => props.state.collection_hash,
  () => {
    if (!props.state.candidates.some((row) => row.revision_id === selected.value))
      select(props.state.sample_ids[0] || props.state.candidates[0]?.revision_id || '')
  },
  { immediate: true }
)
watch(
  () => [item.value?.item_id, current.value?.candidate_hash],
  () => {
    Object.assign(checked, { text: false, images: false, audio: false, played: false })
    if (item.value) emit('inspect', item.value.item_id)
  },
  { immediate: true }
)
const /** 确认当前实际检查记录
   */
  confirm = (): void => {
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
const /** 将选定同类问题篇目移出正常集合
   * @returns 触发异常范围分类
   */
  fail = (): void =>
    emit('action', {
      operation: 'fail',
      scope: 'selected',
      selected_item_ids: affected.value.length
        ? affected.value
        : item.value
          ? [item.value.item_id]
          : [],
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
        <template v-if="detail?.current"
          ><ShortReadingPreview
            v-if="detail.current.template === 'short_reading'"
            :content="normalizeShortReading(detail.current.content)"
            :cover-url="coverUrl"
            :audio-url="audioUrl"
          /><ScenePreview
            v-else
            :content="detail.current.content"
            :revision-id="detail.revision_id || ''"
          /><audio
            v-if="hasAudio && audioUrl"
            controls
            :src="audioUrl"
            @play="checked.played = true"
          />
          <p v-if="hasAudio && !audioUrl">音频尚未加载成功，请刷新后试听。</p></template
        >
        <ElButton v-if="item" link @click="emit('edit', item.item_id)">打开本篇修正</ElButton>
      </AdminPanel>
      <AdminPanel title="明确检查与抽样确认"
        ><p>
          样本由服务端从本工作单范围选取，可增加样本。发现问题后，将实际受影响篇目保留为待校对草稿。
        </p>
        <ElCheckbox v-model="checked.text">已核对完整中英文、人物与顺序、排版</ElCheckbox
        ><ElCheckbox v-if="hasImages" v-model="checked.images">已核对本篇图片</ElCheckbox
        ><ElCheckbox v-if="hasAudio" v-model="checked.audio" :disabled="!checked.played"
          >已实际试听当前音频与句子边界</ElCheckbox
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
        <ElSelect v-model="affected" multiple placeholder="选择同类问题受影响篇目"
          ><ElOption
            v-for="row in items"
            :key="row.item_id"
            :value="row.item_id"
            :label="row.title_en || row.title_zh || '本批篇目'" /></ElSelect
        ><ElButton :disabled="busy || !item" @click="fail">标记所选篇目需校对</ElButton></AdminPanel
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

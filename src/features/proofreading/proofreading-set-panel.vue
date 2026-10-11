<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import { normalizeShortReading } from '@/features/short-reading/short-reading-model'
import ShortReadingPreview from '@/features/short-reading/short-reading-preview.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ProofreadingCandidate, ProofreadingSet } from './proofreading-adapter'

import { candidateHash, createProofreadingAdapter } from './proofreading-adapter'
const props = defineProps<{
  candidates: {
    contentType: ProofreadingCandidate['content_type']
    contentId: string
    revisionId: string
    content: Record<string, unknown>
    contentHash?: string
    title: string
  }[]
}>()
const emit = defineEmits<{ confirmed: [set: ProofreadingSet]; selected: [revisionId: string] }>()
const client = useAdminApiClient()
const adapter = createProofreadingAdapter(client)
const contentAdapter = createContentAdapter(client)
const readingAdapter = createShortReadingAdapter(client)
const media = createSceneMediaAdapter(client)
const previewContent = shallowRef<Record<string, unknown> | null>(null)
const previewReady = ref(false)
const previewBusy = ref(false)
const coverUrl = ref('')
const audioUrl = ref('')
let previewGeneration = 0
const set = shallowRef<ProofreadingSet | null>(null)
const selected = ref('')
const extra = ref<string[]>([])
const normalSelection = ref<string[]>([])
const acceptNormal = ref(false)
const holdAbnormal = ref(false)
const recoveryId = ref('')
const busy = ref(false)
const error = ref('')
const checks = reactive({ text_checked: false, images_checked: false, audio_listened: false })
const exception = ref('TEXT_MISMATCH')
const normalEligible = computed(
  () => set.value?.candidates.filter((item) => item.normal === true && !item.failure) ?? []
)
const samplesChecked = computed(
  () => !!set.value && set.value.sample_ids.every((id) => set.value!.confirmed_ids.includes(id))
)
const canComplete = computed(
  () =>
    !!set.value &&
    set.value.candidates.length > 0 &&
    set.value.candidates.every(
      (item) =>
        set.value!.confirmed_ids.includes(item.revision_id) ||
        (holdAbnormal.value && item.normal === false)
    )
)
const current = computed(() =>
  set.value?.candidates.find((item) => item.revision_id === selected.value)
)
const normalCount = computed(() => set.value?.normal_count ?? props.candidates.length)
let generation = 0
let bulkSignature = ''
let bulkKey = ''
let disposed = false
const /**
   * 串行执行集合命令并阻止离页迟到回写
   * @param action - 本次真实校对命令
   * @returns 当前操作结果或完成状态
   */ run = async (action: () => Promise<void>): Promise<void> => {
    if (busy.value || disposed) return
    busy.value = true
    error.value = ''
    const sequence = generation
    try {
      await action()
    } catch (failure) {
      if (!disposed && sequence === generation)
        error.value = failure instanceof Error ? failure.message : '校对操作失败'
    } finally {
      if (!disposed && sequence === generation) busy.value = false
    }
  }
const /** 读取并建立明确候选集合，抽样成员由服务端决定
   * @returns 当前操作结果或完成状态
   */ create = async (): Promise<void> =>
    run(async () => {
      const sequence = generation
      const candidates = await Promise.all(
        props.candidates.map(async (item) => ({
          content_type: item.contentType,
          content_id: item.contentId,
          revision_id: item.revisionId,
          candidate_hash: item.contentHash || (await candidateHash(item.content))
        }))
      )
      const result = await adapter.create(candidates)
      if (disposed || sequence !== generation) return
      set.value = result
      recoveryId.value = result.public_id
      selected.value = result.sample_ids[0] || result.candidates[0]?.revision_id || ''
    })
const /** 恢复持久化候选集合和确认事实
   * @returns 当前操作结果或完成状态
   */ restore = async (): Promise<void> =>
    run(async () => {
      const sequence = generation
      const result = await adapter.load(recoveryId.value.trim())
      if (!disposed && sequence === generation) {
        set.value = result
        selected.value = result.sample_ids[0] || ''
      }
    })
const /** 刷新服务端确认状态
   * @returns 当前操作结果或完成状态
   */ refresh = async (): Promise<void> => {
    if (!set.value) return
    const sequence = generation
    const result = await adapter.load(set.value.public_id)
    if (!disposed && sequence === generation) set.value = result
  }
const /** 保存这篇固定候选的明确人工检查事实
   * @returns 当前操作结果或完成状态
   */ confirm = async (): Promise<void> =>
    run(async () => {
      if (!set.value || !current.value || !previewReady.value || !checks.text_checked) return
      await adapter.confirm(
        set.value.public_id,
        current.value.revision_id,
        current.value.candidate_hash,
        { ...checks }
      )
      await refresh()
    })
const /** 将当前异常升级到整个集合，批准由服务端撤销
   * @returns 当前操作结果或完成状态
   */ fail = async (): Promise<void> =>
    run(async () => {
      if (!set.value || !current.value) return
      await adapter.fail(set.value.public_id, current.value.revision_id, exception.value)
      await refresh()
    })
const /** 追加管理员明确选择的样本
   * @returns 当前操作结果或完成状态
   */ append = async (): Promise<void> =>
    run(async () => {
      if (!set.value || !extra.value.length) return
      await adapter.append(set.value.public_id, extra.value)
      await refresh()
      extra.value = []
    })
const /** 完成集合校对，仍需单独确认明确发布范围
   * @returns 当前操作结果或完成状态
   */ complete = async (): Promise<void> =>
    run(async () => {
      if (!set.value) return
      await adapter.complete(set.value.public_id, holdAbnormal.value)
      await refresh()
      if (!disposed && set.value) emit('confirmed', set.value)
    })
const /** 接受明确范围的正常结果，不伪造逐项听音事实
   * @returns 当前批准操作完成状态
   */ bulk = async (): Promise<void> =>
    run(async () => {
      if (
        !set.value ||
        !samplesChecked.value ||
        !acceptNormal.value ||
        !normalSelection.value.length
      )
        return
      const signature = JSON.stringify([
        set.value.public_id,
        set.value.collection_hash,
        normalSelection.value
      ])
      if (signature !== bulkSignature) {
        bulkSignature = signature
        bulkKey = createIdempotencyKey()
      }
      await adapter.bulk(
        set.value.public_id,
        set.value.collection_hash,
        normalSelection.value,
        bulkKey
      )
      await refresh()
      normalSelection.value = []
      acceptNormal.value = false
    })
watch(selected, async (value) => {
  checks.text_checked = false
  checks.images_checked = false
  checks.audio_listened = false
  previewContent.value = null
  previewReady.value = false
  coverUrl.value = ''
  audioUrl.value = ''
  emit('selected', value)
  const candidate = set.value?.candidates.find((item) => item.revision_id === value)
  if (!candidate) return
  const sequence = ++previewGeneration
  previewBusy.value = true
  try {
    const snapshot =
      candidate.content_type === 'short_reading'
        ? await readingAdapter.load(candidate.content_id)
        : await contentAdapter.getRevision(candidate.revision_id)
    const raw = { ...snapshot.content }
    if (disposed || sequence !== previewGeneration) return
    if ((await candidateHash(raw)) !== candidate.candidate_hash)
      throw new Error('当前候选正文已经变化，旧校对集合已失效，请重新建立集合')
    if (disposed || sequence !== previewGeneration) return
    previewContent.value = raw
    if (candidate.content_type === 'short_reading') {
      const reading = normalizeShortReading(raw)
      const urls = await Promise.all([
        reading.cover_asset_id ? media.signedUrl(reading.cover_asset_id) : Promise.resolve(null),
        reading.audio ? media.signedUrl(reading.audio.asset_id) : Promise.resolve(null)
      ])
      if (disposed || sequence !== previewGeneration) return
      coverUrl.value = urls[0]?.url ?? ''
      audioUrl.value = urls[1]?.url ?? ''
    }
    previewReady.value = true
  } catch (failure) {
    if (!disposed && sequence === previewGeneration)
      error.value = failure instanceof Error ? failure.message : '固定候选预览加载失败'
  } finally {
    if (sequence === previewGeneration) previewBusy.value = false
  }
})
watch(
  () => JSON.stringify(props.candidates),
  () => {
    generation++
    previewGeneration++
    previewContent.value = null
    previewReady.value = false
    set.value = null
    normalSelection.value = []
    acceptNormal.value = false
    holdAbnormal.value = false
    selected.value = ''
    busy.value = false
    error.value = '候选正文或版本已变化，请重新建立校对集合'
  }
)
onBeforeUnmount(() => {
  disposed = true
  generation++
  previewGeneration++
  previewContent.value = null
  set.value = null
})
</script>
<template>
  <AdminPanel title="固定候选校对与异常处理" class="proofreading-set-panel">
    <p>
      抽样为正常候选的 5%，向上取整，至少 1 篇、最多 20 篇；空集合为
      0。实际成员以服务端返回为准，异常需追加或逐篇核对。
    </p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="metrics">
      <div>{{ set ? '正常候选' : '待分类候选' }} {{ normalCount }}</div>
      <div>服务端样本 {{ set?.sample_ids.length ?? 0 }}</div>
      <div>已批准 {{ set?.confirmed_ids.length ?? 0 }}</div>
      <div>待确认 {{ set ? set.candidates.length - set.confirmed_ids.length : normalCount }}</div>
    </div>
    <div class="actions">
      <ElButton :disabled="busy || !candidates.length" type="primary" @click="create"
        >建立当前明确候选集合</ElButton
      ><ElInput
        v-model="recoveryId"
        placeholder="恢复校对集合编号"
        aria-label="校对集合编号"
      /><ElButton :disabled="busy || !recoveryId.trim()" @click="restore">恢复集合</ElButton>
    </div>
    <template v-if="set"
      ><p>集合 {{ set.public_id }} · {{ set.status }} · 候选哈希 {{ set.collection_hash }}</p>
      <ElSelect v-model="selected" aria-label="当前校对候选"
        ><ElOption
          v-for="item in set.candidates"
          :key="item.revision_id"
          :value="item.revision_id"
          :label="`${candidates.find((candidate) => candidate.revisionId === item.revision_id)?.title || item.content_id}${set.sample_ids.includes(item.revision_id) ? ' · 抽样' : ''}${set.confirmed_ids.includes(item.revision_id) ? ' · 已确认' : ''}`"
      /></ElSelect>
      <p v-if="current">
        当前候选 {{ current.content_id }} · {{ current.revision_id }} · {{ current.candidate_hash }}
      </p>
      <ElSkeleton v-if="previewBusy" :rows="6" animated />
      <template v-else-if="previewContent && current"
        ><ShortReadingPreview
          v-if="current.content_type === 'short_reading'"
          :content="normalizeShortReading(previewContent)"
          :cover-url="coverUrl"
          :audio-url="audioUrl" /><ScenePreview
          v-else
          :content="previewContent"
          :revision-id="current.revision_id"
          :title="String(previewContent.title_zh || previewContent.title_en || '')"
      /></template>
      <div class="checks">
        <ElCheckbox v-model="checks.text_checked" :disabled="busy"
          >已核对完整中英文、义项与来源</ElCheckbox
        ><ElCheckbox v-model="checks.images_checked" :disabled="busy"
          >已查看实际图片与绑定</ElCheckbox
        ><ElCheckbox v-model="checks.audio_listened" :disabled="busy"
          >已实际试听固定音频与切片</ElCheckbox
        >
      </div>
      <div class="actions">
        <ElButton
          :disabled="busy || !current || !previewReady || !checks.text_checked"
          @click="confirm"
          >确认这一篇</ElButton
        ><ElSelect v-model="exception" aria-label="校对异常"
          ><ElOption label="正文或翻译不符" value="TEXT_MISMATCH" /><ElOption
            label="图片或绑定错误"
            value="IMAGE_MISMATCH" /><ElOption
            label="声音或边界错误"
            value="AUDIO_MISMATCH" /><ElOption
            label="来源版权待核验"
            value="COPYRIGHT_UNVERIFIED" /></ElSelect
        ><ElButton type="danger" :disabled="busy || !current" @click="fail"
          >登记异常并撤销集合批准</ElButton
        >
      </div>
      <div class="actions">
        <ElSelect v-model="extra" multiple aria-label="追加抽样"
          ><ElOption
            v-for="item in set.candidates"
            :key="item.revision_id"
            :value="item.revision_id"
            :label="
              candidates.find((candidate) => candidate.revisionId === item.revision_id)?.title ||
              item.content_id
            " /></ElSelect
        ><ElButton :disabled="busy || !extra.length" @click="append">追加抽样</ElButton
        ><ElButton :disabled="busy || !canComplete" type="primary" @click="complete"
          >请求完成固定集合校对</ElButton
        >
      </div>
      <h4>正常集合：抽样通过后明确接受</h4>
      <ElCheckboxGroup v-model="normalSelection"
        ><ElCheckbox
          v-for="item in normalEligible"
          :key="item.revision_id"
          :value="item.revision_id"
          :disabled="busy"
          >{{
            candidates.find((candidate) => candidate.revisionId === item.revision_id)?.title ||
            item.content_id
          }}</ElCheckbox
        ></ElCheckboxGroup
      >
      <ElCheckbox v-model="acceptNormal" :disabled="busy"
        >已核对所有服务端样本，接受所选正常结构化结果</ElCheckbox
      ><ElButton
        :disabled="busy || !samplesChecked || !acceptNormal || !normalSelection.length"
        @click="bulk"
        >批准明确选中 {{ normalSelection.length }} 篇正常候选</ElButton
      >
      <h4>异常处理</h4>
      <p
        v-for="item in set.candidates.filter(
          (candidate) => candidate.failure || candidate.normal === false
        )"
        :key="item.revision_id"
      >
        {{ item.content_id }} · {{ item.failure?.error_code || '需逐篇核对' }} ·
        {{ set.confirmed_ids.includes(item.revision_id) ? '已人工确认' : '保留草稿' }}
      </p>
      <ElCheckbox v-model="holdAbnormal" :disabled="busy"
        >明确保留未批准异常为草稿，仅完成其余已确认候选</ElCheckbox
      >
    </template>
  </AdminPanel>
</template>
<style scoped lang="scss">
.proofreading-set-panel {
  min-width: 0;

  p {
    overflow-wrap: anywhere;
    line-height: 1.7;
    color: var(--juya-color-text-secondary);
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0;

    > div {
      padding: 14px;
      border-radius: 12px;
      background: var(--el-color-primary-light-9);
    }
  }

  .actions,
  .checks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
  }

  .actions :deep(.el-input),
  .actions :deep(.el-select) {
    max-width: 300px;
  }
}

@media (width <= 650px) {
  .proofreading-set-panel .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createCatalogueAdapter } from '@/features/content-catalogue/content-catalogue-adapter'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { MaterialBatch, MaterialBinding } from './content-materials-adapter'
import type { ContentSeries } from '@/features/content/content-adapter'
import type { UploadFile } from 'element-plus'

import { createContentMaterialsAdapter } from './content-materials-adapter'
import ContentMaterialsMatching from './content-materials-matching.vue'
import { allowedMaterialRoles, materialMode, materialStatistics } from './content-materials-model'
import ContentMaterialsPreview from './content-materials-preview.vue'
import ContentMaterialsTarget from './content-materials-target.vue'
import ImportResourcePreview from './import-resource-preview.vue'

const client = useAdminApiClient()
const router = useRouter()
const route = useRoute()
const recoveryBatch = String(route.query.material_batch_id || route.query.batch_id || '')
const requestedBatch = ref(recoveryBatch)
const requestedStage = ref(String(route.query.material_stage_id || ''))
const requestedKey = ref(String(route.query.material_bind_key || ''))
const props = defineProps<{
  initialSeriesId?: string
  initialContentType?: string
  source?: string
}>()
const adapter = createContentMaterialsAdapter(client)
const content = createContentAdapter(client)
const catalogue = createCatalogueAdapter(client)
const readings = createShortReadingAdapter(client)
const context = reactive({
  seriesId: props.initialSeriesId || '',
  type: props.initialContentType || 'word_card',
  page: 1
})
const series = ref<ContentSeries[]>([])
const file = shallowRef<NonNullable<UploadFile['raw']> | null>(null)
const recoveryId = ref('')
const batch = shallowRef<MaterialBatch | null>(null)
const targets = ref<{ id: string; revisionId: string; title: string }[]>([])
const missingDraftCount = ref(0)
const targetId = ref('')
const target = shallowRef<{
  revisionId: string
  version: number
  content: Record<string, unknown>
} | null>(null)
const bindings = ref<(MaterialBinding & { selected: boolean })[]>([])
interface VocabularyRow {
  row_no: number
  entry_type: 'word' | 'chunk'
  import_entry_id: string
  entry_id?: string
  english: string
  meaning_zh: string
  image_path: string | null
  pronunciation_path?: string | null
  operation: string
  previous?: Record<string, unknown>
  issues: { code: string; message?: string; severity: string }[]
  selected: boolean
  noImageConfirmed: boolean
  differenceConfirmed: boolean
}
const vocabularyRows = ref<VocabularyRow[]>([])
const vocabularyHash = ref('')
const chosenVocabulary = computed(() => vocabularyRows.value.filter((row) => row.selected))
const receiptMode = ref<'materials' | 'vocabulary' | null>(null)
const recovering = ref(true)
const command = shallowRef<{ key: string; body: Record<string, unknown> } | null>(null)
const receiptRevision = ref('')
const recoveryConflict = ref(false)
const mode = computed(() =>
  batch.value
    ? materialMode(batch.value.manifest, props.source || 'materials') === 'unknown'
      ? receiptMode.value || 'unknown'
      : materialMode(batch.value.manifest, props.source || 'materials')
    : props.source === 'vocabulary'
      ? 'vocabulary'
      : 'materials'
)
const hasVocabularyTable = computed(
  () =>
    context.type !== 'short_reading' &&
    (mode.value === 'vocabulary' || props.source === 'vocabulary')
)
const packageMismatch = computed(
  () => !!batch.value && props.source === 'vocabulary' && mode.value === 'materials'
)
const statistics = computed(() =>
  batch.value && ['PREVIEW_READY', 'BOUND'].includes(batch.value.status)
    ? materialStatistics(
        batch.value.manifest.resources || [],
        batch.value.content_type || (target.value ? context.type : ''),
        target.value?.content || null
      )
    : { clearAudio: null, ambiguous: null, missingAudio: null, optionalImageErrors: null }
)
const matchingIssues = computed(() =>
  (batch.value?.manifest.resources || [])
    .filter((row) => row.ambiguous_title || row.matching_candidates.length !== 1)
    .map((row) => ({
      path: row.filename || row.path,
      title:
        row.matching_candidates.map((candidate) => candidate.title_en).join(' / ') || '尚未匹配',
      problem: `${row.matching_candidate_count ?? row.matching_candidates.length} 个标题候选 · ${row.kind === 'audio' || /\.(mp3|m4a|wav|aac)$/i.test(row.path) ? '时长待实际解码校验' : '图片角色需人工核对'}`
    }))
)
const requiredAudioIssue = computed(() =>
  target.value && statistics.value.missingAudio === 1
    ? [
        {
          path: '未上传',
          title:
            targets.value.find((row) => row.revisionId === target.value?.revisionId)?.title ||
            target.value.revisionId,
          problem: '当前固定草稿缺少必需完整对话音频，请在下方明确补充'
        }
      ]
    : []
)
const validationErrors = computed(() =>
  batch.value?.status === 'FAILED'
    ? Object.values(
        ((batch.value.manifest as Record<string, unknown>).binding_errors as Record<
          string,
          { error_code: string }
        >) || {}
      )
        .map((row) => row.error_code)
        .join(' / ')
    : ''
)
const checked = ref(false)
const busy = ref(false)
const error = ref('')
const recoveryOpen = ref(false)
const phase = ref<'upload' | 'validation' | 'preview' | 'result'>('upload')
const submittedStage = ref('')
const steps = ['上传 ZIP', '校验', '图文预览', '确认导入']
const phaseIndex = computed(() =>
  ['upload', 'validation', 'preview', 'result'].indexOf(phase.value)
)
const bindingResult = computed(() => {
  if (recoveryConflict.value) return undefined
  const results = (batch.value?.manifest as Record<string, unknown> | undefined)
    ?.binding_results as Record<string, Record<string, unknown>> | undefined
  return submittedStage.value ? results?.[submittedStage.value] : undefined
})
const vocabularyResults = computed(() =>
  Array.isArray(bindingResult.value?.vocabulary_results)
    ? (bindingResult.value!.vocabulary_results as {
        import_entry_id: string
        entry_id: string
        status: string
      }[])
    : []
)
const bindingCompleted = computed(
  () =>
    bindingResult.value?.status === 'BOUND' &&
    (!hasVocabularyTable.value ||
      chosenVocabulary.value.every((row) =>
        vocabularyResults.value.some(
          (result) =>
            result.import_entry_id === row.import_entry_id &&
            ['CREATED', 'UPDATED', 'SKIPPED'].includes(result.status)
        )
      ))
)
const bindingError = computed(() => {
  if (recoveryConflict.value) return ''
  const errors = (batch.value?.manifest as Record<string, unknown> | undefined)?.binding_errors as
    Record<string, { error_code?: string }> | undefined
  return errors?.[submittedStage.value]?.error_code || ''
})
watch(
  () => [
    phase.value,
    bindingCompleted.value,
    batch.value?.batch_id,
    submittedStage.value,
    route.query.material_phase,
    route.query.material_batch_id,
    route.query.material_stage_id,
    recovering.value,
    recoveryConflict.value
  ],
  () => {
    if (recovering.value || recoveryConflict.value) return
    if (
      route.name !== 'content-import' ||
      !['materials', 'vocabulary'].includes(String(route.query.source))
    )
      return
    const actualPhase =
      phase.value === 'result' && !bindingCompleted.value ? 'processing' : phase.value
    if (
      route.query.material_phase === actualPhase &&
      route.query.material_batch_id === batch.value?.batch_id &&
      route.query.material_stage_id === (submittedStage.value || undefined)
    )
      return
    void router.replace({
      name: 'content-import',
      query: {
        ...route.query,
        source:
          context.type === 'short_reading'
            ? 'materials'
            : mode.value === 'vocabulary'
              ? 'vocabulary'
              : props.source === 'vocabulary'
                ? 'vocabulary'
                : 'materials',
        series_id: context.seriesId || undefined,
        content_type: context.type,
        material_phase: actualPhase,
        material_batch_id: batch.value?.batch_id,
        material_stage_id: submittedStage.value || undefined,
        material_bind_key:
          phase.value === 'upload' ? undefined : command.value?.key || route.query.material_bind_key
      }
    })
  },
  { flush: 'post' }
)
const previewRows = computed(() =>
  hasVocabularyTable.value
    ? chosenVocabulary.value.map((row) => ({
        path: (row.entry_type === 'chunk' ? row.pronunciation_path : row.image_path) || '',
        // 同一词汇行的图片与独立音频属于同一选择范围，不拆成两个操作
        pronunciation_path: row.entry_type === 'word' ? row.pronunciation_path || '' : '',
        entry_id: row.import_entry_id,
        english: row.english,
        meaning: row.meaning_zh,
        source:
          targets.value.find((item) => item.revisionId === targetId.value)?.title ||
          receiptRevision.value ||
          '—',
        role: row.entry_type === 'chunk' ? 'CHUNK_AUDIO' : 'WORD_IMAGE',
        operation: row.operation,
        previous: row.previous
      }))
    : selected.value.map((binding) => {
        const entry = roleEntries(binding.role).find((item) => item.entry_id === binding.entry_id)
        return {
          ...binding,
          english: entry?.english || '—',
          meaning: entry?.chinese || '—',
          source:
            targets.value.find((item) => item.revisionId === targetId.value)?.title ||
            receiptRevision.value ||
            '—',
          operation: 'BIND',
          previous: undefined
        }
      })
)
let uploadKey = createIdempotencyKey()
let bindKey = ''
let bindSignature = ''
let generation = 0
let disposed = false
const roleLabels: Record<string, string> = {
  COVER_IMAGE: '封面',
  LEARNING_IMAGE: '学习原图',
  WORD_IMAGE: '词汇小图',
  WHOLE_AUDIO: '整段对话音频',
  FULL_AUDIO: '短文全文音频',
  WORD_AUDIO: '词汇音频',
  CHUNK_AUDIO: '语块音频'
}
const selected = computed(() => bindings.value.filter((row) => row.selected))
const chosenCount = computed(() =>
  hasVocabularyTable.value ? chosenVocabulary.value.length : selected.value.length
)
const canPreview = computed(
  () =>
    !!target.value &&
    !recoveryConflict.value &&
    mode.value !== 'unknown' &&
    !packageMismatch.value &&
    target.value.revisionId === targetId.value &&
    (hasVocabularyTable.value
      ? !!vocabularyHash.value &&
        chosenVocabulary.value.length > 0 &&
        chosenVocabulary.value.every(
          (row) =>
            !row.issues.some((issue) => issue.severity === 'ERROR') &&
            (row.entry_type === 'chunk' || !!row.image_path || row.noImageConfirmed)
        )
      : selected.value.length > 0 && validBindings.value)
)
const entries = computed(() => (target.value ? normalizeSceneContent(target.value.content) : null))
const validBindings = computed(
  () =>
    selected.value.every((row) => {
      const resource = batch.value?.manifest.resources?.find((item) => item.path === row.path)
      return (
        !!resource &&
        allowedMaterialRoles(resource.allowed_roles, context.type).includes(row.role) &&
        (!['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(row.role) ||
          roleEntries(row.role).some((entry) => entry.entry_id === row.entry_id))
      )
    }) &&
    new Set(selected.value.map((row) => `${row.role}:${row.entry_id || ''}`)).size ===
      selected.value.length
)
const ready = computed(
  () =>
    !!target.value &&
    !recoveryConflict.value &&
    target.value.revisionId === targetId.value &&
    checked.value &&
    mode.value !== 'unknown' &&
    !packageMismatch.value &&
    (hasVocabularyTable.value
      ? !!vocabularyHash.value &&
        chosenVocabulary.value.length > 0 &&
        chosenVocabulary.value.every(
          (row) =>
            !row.issues.some((issue) => issue.severity === 'ERROR') &&
            (row.entry_type === 'chunk' || !!row.image_path || row.noImageConfirmed) &&
            (row.operation !== 'UPDATE' || row.differenceConfirmed)
        )
      : selected.value.length > 0 &&
        selected.value.every((row) => row.role && validBindings.value) &&
        new Set(selected.value.map((row) => `${row.role}:${row.entry_id || ''}`)).size ===
          selected.value.length) &&
    ['PREVIEW_READY', 'BOUND'].includes(batch.value?.status || '')
)
watch(targetId, () => {
  target.value = null
  checked.value = false
  vocabularyHash.value = ''
  vocabularyRows.value = []
})
watch(
  bindings,
  () => {
    checked.value = false
  },
  { deep: true }
)
watch(
  () => [context.seriesId, context.type, context.page],
  () => {
    target.value = null
    targets.value = []
    missingDraftCount.value = 0
    targetId.value = ''
    checked.value = false
  }
)
watch(
  () => [context.seriesId, context.type],
  () => {
    uploadKey = createIdempotencyKey()
  }
)
onBeforeUnmount(() => {
  disposed = true
  generation++
})

const /**
   * 串行执行素材命令，离页后不回写
   * @param action - 本次明确的素材操作
   */ run = async (action: () => Promise<void>): Promise<void> => {
    if (busy.value) return
    const token = generation
    busy.value = true
    error.value = ''
    try {
      await action()
    } catch (failure) {
      if (!disposed && token === generation)
        error.value = failure instanceof Error ? failure.message : '素材操作失败'
    } finally {
      if (!disposed && token === generation) busy.value = false
    }
  }
const /**
   * 读取实际文件清单；新批次清除之前的绑定选择
   * @param id - 服务端素材批次编号
   */ read = async (id: string): Promise<void> => {
    const token = generation
    const value = await adapter.load(id)
    if (disposed || token !== generation) return
    if (batch.value?.batch_id !== value.batch_id) {
      target.value = null
      targetId.value = ''
      vocabularyRows.value = []
      vocabularyHash.value = ''
      if (batch.value) {
        submittedStage.value = ''
        command.value = null
        receiptMode.value = null
        receiptRevision.value = ''
      }
      checked.value = false
      bindings.value = (value.manifest.resources || []).map((row) => ({
        path: row.path,
        role: '',
        selected: false
      }))
    } else if (!bindings.value.length)
      bindings.value = (value.manifest.resources || []).map((row) => ({
        path: row.path,
        role: '',
        selected: false
      }))
    if (value.series_id) context.seriesId = value.series_id
    if (value.content_type) context.type = value.content_type
    await Promise.resolve()
    if (disposed || token !== generation) return
    batch.value = value
    if (!vocabularyRows.value.length && Array.isArray(value.manifest.vocabulary_rows))
      vocabularyRows.value = (value.manifest.vocabulary_rows as VocabularyRow[]).map((row) => ({
        ...row,
        selected: false,
        noImageConfirmed: false,
        differenceConfirmed: false
      }))
    recoveryId.value = value.batch_id
    if (phase.value === 'upload') phase.value = 'validation'
    restoreReceipt(value)
  }
const /**
   * 更换本地素材包时更换上传身份
   * @param value - 管理员重新选择的 ZIP
   */ selectFile = (value: UploadFile): void => {
    if (batch.value) startNew()
    file.value = value.raw || null
    uploadKey = createIdempotencyKey()
    phase.value = 'upload'
    submittedStage.value = ''
  }
const /** 上传明确系列和模板的独立素材 ZIP
   * @returns 上传与恢复结果完成状态
   */ upload = async (): Promise<void> =>
    run(async () => {
      if (!file.value || !context.seriesId || (hasVocabularyTable.value && !target.value)) return
      const token = generation
      const fixedSource = hasVocabularyTable.value ? targetId.value : ''
      const value = await adapter.upload(file.value, context.seriesId, context.type, uploadKey)
      if (disposed || token !== generation) return
      await read(value.batch_id)
      if (fixedSource) {
        targetId.value = fixedSource
        await nextTick()
        await readTarget()
      }
    })
const /** 加载当前页可编辑草稿，标题建议不自动采用
   * @returns 草稿加载完成状态
   */ loadTargets = async (): Promise<void> =>
    run(async () => {
      const token = generation
      if (!series.value.length) series.value = await content.listSeries()
      if (!context.seriesId) return
      const value = await catalogue.list({
        page: context.page,
        pageSize: 100,
        query: '',
        seriesId: context.seriesId,
        contentType: context.type as 'dialogue' | 'word_card' | 'short_reading',
        status: ''
      })
      if (disposed || token !== generation) return
      missingDraftCount.value = value.items.filter((row) => !row.draft_revision_id).length
      targets.value = value.items
        .filter((row) => row.draft_revision_id)
        .map((row) => ({
          id: row.id,
          revisionId: row.draft_revision_id!,
          title: row.title_zh || row.title_en
        }))
    })
const /** 读取明确选择的草稿版本和稳定词条
   * @returns 固定草稿读取完成状态
   */ readTarget = async (): Promise<void> => {
    const token = generation
    target.value = null
    checked.value = false
    const row = targets.value.find((item) => item.revisionId === targetId.value)
    if (!row) return
    const value =
      context.type === 'short_reading'
        ? await readings.load(row.id)
        : await content.getRevision(row.revisionId)
    if (disposed || token !== generation || targetId.value !== row.revisionId) return
    if ('revisionId' in value && value.revisionId !== row.revisionId)
      throw new Error('来源草稿已改变，请重新加载并选择当前候选版本')
    target.value = {
      revisionId: row.revisionId,
      version: 'editVersion' in value ? value.editVersion : value.version,
      content: { ...value.content }
    }
    if (hasVocabularyTable.value && batch.value) {
      const preview = await client.request<{
        preview_hash: string
        revision_id: string
        expected_version: number
        vocabulary_rows: Omit<
          VocabularyRow,
          'selected' | 'noImageConfirmed' | 'differenceConfirmed'
        >[]
      }>({
        method: 'GET',
        path: `/api/v1/admin/content-materials/${encodeURIComponent(batch.value.batch_id)}/vocabulary-preview`,
        query: { revision_id: row.revisionId, expected_version: target.value.version }
      })
      if (disposed || token !== generation || targetId.value !== row.revisionId) return
      if (
        preview.revision_id !== row.revisionId ||
        preview.expected_version !== target.value.version ||
        !/^[a-f0-9]{64}$/.test(preview.preview_hash)
      )
        throw new Error('图包预览与当前来源版本不一致，请重新读取')
      vocabularyHash.value = preview.preview_hash
      vocabularyRows.value = preview.vocabulary_rows.map((item) => ({
        ...item,
        selected: false,
        noImageConfirmed: false,
        differenceConfirmed: false
      }))
    }
  }
const /** 串行读取管理员明确的来源版本
   * @returns 来源读取结果
   */ loadTarget = async (): Promise<void> => run(readTarget)
const /** 明确绑定选中文件，网络不确定时保留相同命令身份
   * @returns 绑定命令完成状态
   */ bind = async (): Promise<void> =>
    run(async () => {
      if (!ready.value || !target.value || !batch.value) return
      const token = generation
      const batchId = batch.value.batch_id
      const rows = selected.value.map((row) => ({
        path: row.path,
        role: row.role,
        ...(['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(row.role)
          ? { entry_id: row.entry_id }
          : {})
      }))
      const signature = JSON.stringify([
        batch.value.batch_id,
        target.value.revisionId,
        target.value.version,
        rows,
        vocabularyHash.value,
        chosenVocabulary.value.map((row) => [
          row.import_entry_id,
          row.noImageConfirmed,
          row.differenceConfirmed
        ])
      ])
      if (signature !== bindSignature) {
        bindSignature = signature
        bindKey = createIdempotencyKey()
      }
      command.value = {
        key: bindKey,
        body: {
          revision_id: target.value.revisionId,
          expected_version: target.value.version,
          manual_checked: true,
          bindings: hasVocabularyTable.value ? [] : rows,
          ...(hasVocabularyTable.value
            ? {
                vocabulary_preview_hash: vocabularyHash.value,
                vocabulary_selections: chosenVocabulary.value.map((row) => ({
                  import_entry_id: row.import_entry_id,
                  no_image_confirmed: row.noImageConfirmed,
                  difference_confirmed: row.differenceConfirmed
                }))
              }
            : {})
        }
      }
      try {
        await submitCommand()
      } catch (failure) {
        if (disposed || token !== generation) return
        if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
          await rejectCommand()
        } else {
          phase.value = 'result'
        }
        await read(batchId).catch(() => undefined)
        throw failure
      }
      if (disposed || token !== generation) return
      checked.value = false
      await read(batchId)
    })
const /**
   * 获取本篇角色所需的稳定词条
   * @param role - 文件正在绑定的角色
   * @returns 本篇词汇或语块
   */ roleEntries = (role: string) =>
    context.type === 'short_reading'
      ? []
      : role === 'CHUNK_AUDIO'
        ? entries.value?.chunks || []
        : entries.value?.vocabulary || []
const /** 进入固定草稿的图文核对，不自动确认任何文件
   * @returns 切换预览状态
   */ showPreview = (): void => {
    checked.value = false
    phase.value = 'preview'
  }
const /** 恢复上传入口，已有完成结果仍保留在服务端
   * @returns 新包上传状态
   */ startNew = (): void => {
    recoveryConflict.value = false
    phase.value = 'upload'
    submittedStage.value = ''
    command.value = null
    receiptMode.value = null
    receiptRevision.value = ''
    checked.value = false
    batch.value = null
    file.value = null
    target.value = null
    targetId.value = ''
    vocabularyHash.value = ''
    vocabularyRows.value = []
    bindings.value = []
  }
const /** 返回批量导入的来源选择入口
   * @returns 路由切换完成状态
   */ returnToImport = (): void => {
    void router.push({
      name: 'content-import',
      query: { series_id: context.seriesId || undefined, content_type: context.type }
    })
  }
const /** 素材实际绑定后桥接工作单，保留对应正文范围 */
  continueWorkOrder = async (): Promise<void> => {
    if (!bindingCompleted.value || !batch.value) return
    await run(async () => {
      const token = generation
      const batchId = batch.value!.batch_id
      const order = await createWorkOrderAdapter(client).fromBatch(batchId)
      if (disposed || token !== generation || batch.value?.batch_id !== batchId) return
      await router.push({ name: 'content-work-order', params: { id: order.work_order_id } })
    })
  }
const /**
   * 恢复 URL 指定阶段或原幂等键对应的回执
   * @param value - 当前批次的实际持久化清单
   */ restoreReceipt = (value: MaterialBatch): void => {
    const manifest = value.manifest as Record<string, unknown>
    const requests = (manifest.binding_requests || {}) as Record<
      string,
      { key?: string; request?: Record<string, unknown> }
    >
    const key =
      command.value?.key || (value.batch_id === requestedBatch.value ? requestedKey.value : '')
    const stage =
      submittedStage.value ||
      (!command.value && value.batch_id === requestedBatch.value ? requestedStage.value : '') ||
      (key ? Object.keys(requests).find((id) => requests[id]?.key === key) : '')
    const receipt = stage ? requests[stage] : undefined
    // 双身份必须指向同一持久化回执，冲突时不采用任何请求或结果
    if (
      stage &&
      key &&
      ((receipt && receipt.key !== key) ||
        (!receipt && !command.value && requestedStage.value && requestedKey.value))
    ) {
      recoveryConflict.value = true
      submittedStage.value = ''
      command.value = null
      receiptRevision.value = ''
      receiptMode.value = null
      bindings.value = []
      vocabularyRows.value = []
      checked.value = false
      target.value = null
      phase.value = 'result'
      error.value =
        '绑定恢复身份冲突：阶段与原幂等键无法对应同一回执，当前状态未知；请核对原链接后恢复'
      return
    }
    recoveryConflict.value = false
    const request = receipt?.request
    if (!request) {
      if (key || (value.batch_id === requestedBatch.value && requestedStage.value)) {
        phase.value = 'result'
        error.value = '当前绑定回执尚未确认，请恢复原操作；不会推断最新任务或重发新绑定'
      }
      return
    }
    submittedStage.value = stage || ''
    receiptRevision.value = String(request.revision_id || '')
    if (receipt?.key)
      command.value = { key: receipt.key, body: { ...request, manual_checked: true } }
    const bound = Array.isArray(request.bindings) ? (request.bindings as MaterialBinding[]) : []
    const selections = Array.isArray(request.vocabulary_selections)
      ? (request.vocabulary_selections as {
          import_entry_id: string
          no_image_confirmed?: boolean
          difference_confirmed?: boolean
        }[])
      : []
    if (selections.length) receiptMode.value = 'vocabulary'
    else if (bound.length) receiptMode.value = 'materials'
    bindings.value = (value.manifest.resources || []).map((resource) => {
      const binding = bound.find((row) => row.path === resource.path)
      return binding
        ? { ...binding, selected: true }
        : { path: resource.path, role: '', selected: false }
    })
    if (selections.length && Array.isArray(manifest.vocabulary_rows))
      vocabularyRows.value = (manifest.vocabulary_rows as VocabularyRow[]).map((row) => {
        const selection = selections.find((item) => item.import_entry_id === row.import_entry_id)
        return {
          ...row,
          selected: !!selection,
          noImageConfirmed: !!selection?.no_image_confirmed,
          differenceConfirmed: !!selection?.difference_confirmed
        }
      })
    phase.value = 'result'
  }
const /** 提交冻结的素材命令，不从可变表单重建请求 */ submitCommand = async (): Promise<void> => {
    if (recoveryConflict.value || !command.value || !batch.value) return
    const token = generation
    const origin = { batchId: batch.value.batch_id, key: command.value.key }
    const receipt = await client.request<{ stage_id?: string }>({
      method: 'POST',
      path: `/api/v1/admin/content-materials/${encodeURIComponent(batch.value.batch_id)}/bindings`,
      headers: { 'Idempotency-Key': command.value.key },
      body: command.value.body
    })
    if (
      disposed ||
      token !== generation ||
      batch.value?.batch_id !== origin.batchId ||
      command.value?.key !== origin.key
    )
      return
    submittedStage.value = receipt.stage_id || ''
    phase.value = 'result'
  }
const /** 服务端明确拒绝原命令时返回校验，要求重新读取来源版本 */ rejectCommand =
    async (): Promise<void> => {
      command.value = null
      submittedStage.value = ''
      requestedStage.value = ''
      requestedKey.value = ''
      target.value = null
      checked.value = false
      await router.replace({
        name: 'content-import',
        query: {
          ...route.query,
          material_stage_id: undefined,
          material_bind_key: undefined,
          material_phase: 'validation'
        }
      })
      phase.value = 'validation'
    }
const /**
   * 未确认回执时续办冻结的同一个请求和幂等键
   * @returns 原操作续办结果
   */ resumeUnknown = async (): Promise<void> =>
    run(async () => {
      if (recoveryConflict.value || !command.value || !batch.value || submittedStage.value) return
      const token = generation
      const batchId = batch.value.batch_id
      try {
        await submitCommand()
      } catch (failure) {
        if (disposed || token !== generation) return
        if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500)
          await rejectCommand()
        throw failure
      } finally {
        if (!disposed && token === generation) await read(batchId)
      }
    })
const /**
   * 只重试明确失败且没有成功结果的原绑定
   * @returns 本次失败绑定重试结果
   */ retryFailed = async (): Promise<void> =>
    run(async () => {
      if (
        recoveryConflict.value ||
        !batch.value ||
        !bindingError.value ||
        bindingCompleted.value ||
        !command.value
      )
        return
      const token = generation
      const batchId = batch.value.batch_id
      command.value = {
        key: createIdempotencyKey(),
        body: globalThis.structuredClone(command.value.body)
      }
      submittedStage.value = ''
      try {
        await submitCommand()
      } catch (failure) {
        if (disposed || token !== generation) return
        if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500)
          await rejectCommand()
        throw failure
      } finally {
        if (!disposed && token === generation) await read(batchId)
      }
    })
watch(
  () => [
    String(route.query.material_batch_id || route.query.batch_id || ''),
    String(route.query.material_stage_id || ''),
    String(route.query.material_bind_key || '')
  ],
  ([id, stage, key]) => {
    if (
      !id ||
      (id === batch.value?.batch_id &&
        (!stage || stage === submittedStage.value) &&
        (!key || key === command.value?.key))
    )
      return
    generation++
    busy.value = false
    recovering.value = true
    startNew()
    requestedBatch.value = id || ''
    requestedStage.value = stage || ''
    requestedKey.value = key || ''
    const token = generation
    void run(async () => {
      try {
        await read(id || '')
      } finally {
        if (token === generation) recovering.value = false
      }
    })
  }
)
onMounted(() => {
  const token = generation
  void run(async () => {
    try {
      const loaded = await content.listSeries()
      if (disposed || token !== generation) return
      series.value = loaded
      if (recoveryBatch) await read(recoveryBatch)
    } finally {
      if (token === generation) recovering.value = false
    }
  })
})
</script>
<template>
  <section class="content-materials-panel">
    <nav v-if="hasVocabularyTable" class="material-steps" aria-label="词汇图包导入步骤">
      <span v-for="(step, index) in steps" :key="step" :class="{ active: index === phaseIndex }">{{
        step
      }}</span>
    </nav>
    <ElAlert
      v-if="!adapter.available"
      title="素材导入服务暂时不可用"
      type="warning"
      :closable="false"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ContentMaterialsMatching
      v-if="!hasVocabularyTable"
      :statistics="statistics"
      :batch-id="batch?.batch_id || ''"
      :revision-id="target?.revisionId"
      :issues="[...matchingIssues, ...requiredAudioIssue]"
    />
    <ElAlert
      v-if="mode === 'unknown'"
      title="历史清单未记录包类型，请核对原 ZIP 或明确的绑定回执；当前不发送新绑定"
      type="warning"
      :closable="false"
    />
    <ElAlert
      v-if="packageMismatch"
      title="该包未包含词汇表.xlsx，请使用独立素材入口或修正原 ZIP"
      type="error"
      :closable="false"
    />
    <ElAlert
      v-if="batch?.status === 'FAILED'"
      :title="`校验失败：${validationErrors || '错误详情待恢复'}。原 ZIP 已保留，请修正原文件后重新上传。`"
      type="error"
      :closable="false"
    />
    <template v-if="phase === 'upload'">
      <AdminPanel
        :title="hasVocabularyTable ? '词汇与图片，一次上传' : '补充独立音频与图片'"
        class="material-card"
      >
        <p>
          将对应素材放入同一个
          ZIP，选择来源内容后按稳定条目核对。英文和当前释义保留为可编辑文字，图片不提取文字。
        </p>
        <p v-if="context.seriesId" class="caption">
          分类：{{ series.find((row) => row.id === context.seriesId)?.title || context.seriesId }} ·
          {{
            context.type === 'dialogue'
              ? '场景对话'
              : context.type === 'short_reading'
                ? '独立短文阅读'
                : '原词汇卡'
          }}
        </p>
        <div v-if="!initialSeriesId && !batch" class="actions">
          <ElButton :loading="busy" @click="loadTargets">加载素材分类 / 草稿</ElButton
          ><ElSelect
            v-model="context.seriesId"
            aria-label="素材目标分类"
            placeholder="目标分类"
            :disabled="busy || !!initialSeriesId"
            ><ElOption
              v-for="row in series"
              :key="row.id"
              :value="row.id"
              :label="row.title" /></ElSelect
          ><ElSelect
            v-model="context.type"
            aria-label="素材内容模板"
            :disabled="busy || !!initialContentType"
            ><ElOption label="原词汇卡" value="word_card" /><ElOption
              label="场景对话"
              value="dialogue" /><ElOption label="独立短文" value="short_reading"
          /></ElSelect>
        </div>
        <ContentMaterialsTarget
          v-if="hasVocabularyTable"
          v-model:page="context.page"
          v-model:target-id="targetId"
          :targets="targets"
          :busy="busy"
          :missing-draft-count="missingDraftCount"
          :target="target"
          @load="loadTargets"
          @read="loadTarget"
        />
        <div class="selected-package">
          <div>
            <strong>{{
              file?.name ||
              (hasVocabularyTable ? '选择词汇表.xlsx + images/ ZIP' : '选择独立图片 / 音频 ZIP')
            }}</strong
            ><small>{{
              file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                : '本地 ZIP 文件，上传后查看真实校验结果'
            }}</small>
          </div>
          <ElUpload
            :auto-upload="false"
            :show-file-list="false"
            accept=".zip"
            :disabled="busy || !adapter.available"
            @change="selectFile"
            ><ElButton :disabled="busy || !adapter.available">{{
              file ? '更换 ZIP' : hasVocabularyTable ? '选择词汇图包 ZIP' : '选择独立素材 ZIP'
            }}</ElButton></ElUpload
          >
        </div>
      </AdminPanel>
      <AdminPanel v-if="hasVocabularyTable" title="每条词汇都有自己的图片路径" class="material-card"
        ><ElTable
          :data="[
            {
              field: '条目 ID',
              example: 'v_coffee_latte_01',
              rule: '唯一标识；按当前来源的稳定条目核对'
            },
            {
              field: '英文 / 当前释义',
              example: 'latte / 拿铁咖啡',
              rule: '保存当前篇目中的意思，同词不同语境分别保留'
            },
            {
              field: '图片路径',
              example: 'images/v_coffee_latte_01.png',
              rule: '按条目 ID 对应图片；不按行号或英文猜测'
            }
          ]"
          ><ElTableColumn label="表格字段" prop="field" min-width="150" /><ElTableColumn
            label="格式示例"
            prop="example"
            min-width="240" /><ElTableColumn label="用途" prop="rule" min-width="300"
        /></ElTable>
        <p class="caption">
          图片和音频由管理员确认角色；已有用户收藏资料不被后台更新自动改写。
        </p></AdminPanel
      >
    </template>
    <ElButton
      v-if="phase === 'upload'"
      link
      type="primary"
      class="recovery-entry"
      @click="recoveryOpen = !recoveryOpen"
      >恢复已有素材批次</ElButton
    >
    <AdminPanel
      v-if="phase === 'validation' || (phase === 'upload' && recoveryOpen)"
      class="material-card"
      :title="hasVocabularyTable ? '图包校验与恢复' : '明确素材来源与角色'"
    >
      <div class="actions">
        <ElInput v-model="recoveryId" aria-label="素材批次编号" placeholder="恢复已有素材批次" />
        <ElButton :disabled="busy || !recoveryId.trim()" @click="run(() => read(recoveryId.trim()))"
          >恢复 / 刷新素材结果</ElButton
        >
      </div>
      <template v-if="batch">
        <p v-if="hasVocabularyTable && Array.isArray(batch.manifest.vocabulary_rows)">
          本包 {{ vocabularyRows.length }} 行 · 错误
          {{
            vocabularyRows.filter((row) => row.issues.some((issue) => issue.severity === 'ERROR'))
              .length
          }}
          行 · 缺图待确认
          {{
            vocabularyRows.filter(
              (row) => row.entry_type === 'word' && !row.image_path && !row.noImageConfirmed
            ).length
          }}
          行
        </p>
        <p>
          {{
            Array.isArray(batch.manifest.resources)
              ? `${batch.manifest.resources.length}份素材`
              : '素材数量待校验'
          }}
          ·
          {{
            ['PREVIEW_READY', 'BOUND'].includes(batch.status)
              ? '文件校验已完成，请核对来源与条目'
              : '正在处理或需要恢复，请刷新结果'
          }}
        </p>
        <ContentMaterialsTarget
          v-model:page="context.page"
          v-model:target-id="targetId"
          :targets="targets"
          :busy="busy"
          :missing-draft-count="missingDraftCount"
          :target="target"
          @load="loadTargets"
          @read="loadTarget"
        />
        <ElAlert
          v-if="
            hasVocabularyTable &&
            Array.isArray(batch.manifest.vocabulary_rows) &&
            !batch.manifest.vocabulary_rows.length
          "
          title="词汇表没有可导入行，请修正原 ZIP 后重新上传"
          type="error"
          :closable="false"
        />
        <ElTable
          v-if="hasVocabularyTable"
          :data="vocabularyRows"
          empty-text="读取来源草稿后查看逐行校验与差异"
        >
          <ElTableColumn label="导入范围" width="100"
            ><template #default="{ row }"
              ><ElCheckbox
                v-model="row.selected"
                :disabled="
                  busy ||
                  row.issues.some((issue: { severity: string }) => issue.severity === 'ERROR')
                "
                :aria-label="`选择词汇 ${row.import_entry_id}`"
                @change="checked = false" /></template
          ></ElTableColumn>
          <ElTableColumn label="表格行 / ID" min-width="190"
            ><template #default="{ row }"
              >第{{ row.row_no }}行 · {{ row.import_entry_id }}</template
            ></ElTableColumn
          >
          <ElTableColumn label="英文 / 当前释义" min-width="190"
            ><template #default="{ row }"
              >{{ row.english }} · {{ row.meaning_zh }}</template
            ></ElTableColumn
          >
          <ElTableColumn label="问题" min-width="220"
            ><template #default="{ row }"
              ><span v-for="issue in row.issues" :key="issue.code"
                >{{ issue.message || issue.code }} </span
              ><span v-if="!row.issues.length">校验合格</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="图片路径 / 处理" min-width="210"
            ><template #default="{ row }"
              ><span v-if="row.entry_type !== 'chunk' && row.image_path">{{ row.image_path }}</span
              ><ElCheckbox
                v-else-if="row.entry_type !== 'chunk'"
                v-model="row.noImageConfirmed"
                :disabled="busy"
                @change="checked = false"
                >明确确认无图</ElCheckbox
              ></template
            ></ElTableColumn
          >
          <ElTableColumn
            v-if="vocabularyRows.some((row) => row.pronunciation_path)"
            label="独立音频 / 角色"
            min-width="220"
          >
            <template #default="{ row }">
              <div v-if="row.pronunciation_path">
                <span>{{
                  row.entry_type === 'word'
                    ? '词汇独立音频 · WORD_AUDIO'
                    : '语块独立音频 · CHUNK_AUDIO'
                }}</span>
                <p>{{ row.pronunciation_path }}</p>
                <ImportResourcePreview
                  source="materials"
                  :batch-id="batch.batch_id"
                  :path="row.pronunciation_path"
                  :disabled="busy"
                />
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
        <article
          v-for="(resource, index) in hasVocabularyTable ? [] : batch.manifest.resources || []"
          :key="resource.path"
          class="binding-row"
        >
          <div>
            <strong>{{ resource.path }}</strong>
            <p>
              {{
                resource.ambiguous_title
                  ? '同名存在多个候选，需明确选择正确来源'
                  : '按当前内容与素材角色逐项核对'
              }}
            </p>
            <p v-for="candidate in resource.matching_candidates" :key="candidate.revision_id">
              候选：{{ candidate.title_en }} · {{ candidate.revision_id }} · 版本
              {{ candidate.edit_version }}（仅建议）
            </p>
          </div>
          <template v-if="bindings[index]"
            ><ElCheckbox v-model="bindings[index]!.selected" :disabled="busy"
              >明确绑定这个文件</ElCheckbox
            ><ElSelect
              v-model="bindings[index]!.role"
              :disabled="busy || !target"
              :aria-label="`素材角色 ${index + 1}`"
              placeholder="文件角色"
              ><ElOption
                v-for="role in allowedMaterialRoles(resource.allowed_roles, context.type)"
                :key="role"
                :value="role"
                :label="roleLabels[role] || role" /></ElSelect
            ><ElSelect
              v-if="['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(bindings[index]!.role)"
              v-model="bindings[index]!.entry_id"
              :disabled="busy || !target"
              :aria-label="`素材词条 ${index + 1}`"
              placeholder="本篇稳定词条"
              ><ElOption
                v-for="entry in roleEntries(bindings[index]!.role)"
                :key="entry.entry_id"
                :label="`${entry.english} · ${entry.chinese} · ${entry.entry_id}`"
                :value="entry.entry_id" /></ElSelect
          ></template>
        </article>
      </template>
    </AdminPanel>
    <template v-if="phase === 'preview' && batch">
      <AdminPanel
        :title="hasVocabularyTable ? '逐条确认图片、英文与当前释义' : '核对明确的文件、角色与来源'"
        class="material-card"
        ><p>本次明确选择 {{ chosenCount }}条资料，来源与版本固定后再确认导入。</p>
        <ContentMaterialsPreview
          :batch-id="batch.batch_id"
          :busy="busy"
          :content-type="context.type"
          :rows="previewRows"
        />
      </AdminPanel>
      <AdminPanel
        :title="hasVocabularyTable ? '同一条目：核对后再确认更新' : '核对固定草稿与素材角色'"
        class="material-card"
        ><p>
          仅更新已明确选择的当前草稿条目，来源与义项仍分别保留。替换音频或图片后需重新校对，已有线上版本与收藏资料不会静默覆盖。
        </p>
        <div
          v-for="row in chosenVocabulary.filter((item) => item.operation === 'UPDATE')"
          :key="row.import_entry_id"
          class="difference-row"
        >
          <strong>{{ row.import_entry_id }} · {{ row.english }}</strong>
          <p>
            原释义：{{ row.previous?.meaning_zh || row.previous?.chinese || '—' }} → 本次释义：{{
              row.meaning_zh
            }}
          </p>
          <ElCheckbox v-model="row.differenceConfirmed" :disabled="busy" @change="checked = false"
            >已核对该条目变更</ElCheckbox
          >
        </div>
        <ElCheckbox v-model="checked" :disabled="busy || !target"
          >已逐项核对文件、角色、当前草稿和稳定词条</ElCheckbox
        ></AdminPanel
      >
    </template>
    <template v-if="phase === 'result' && batch">
      <AdminPanel class="material-card result-card"
        ><strong class="result-status">{{ bindingCompleted ? '已完成' : '等待处理结果' }}</strong>
        <h2>
          {{
            bindingCompleted
              ? hasVocabularyTable
                ? `${vocabularyResults.length} 条词汇资料已保存`
                : '选中素材已关联至来源草稿'
              : '导入任务已提交，尚未完成绑定'
          }}
        </h2>
        <ElAlert
          v-if="bindingError"
          :title="`当前导入失败：${bindingError}。原文件与草稿已保留，请修正后恢复。`"
          :closable="false"
          type="error"
        />
        <p v-if="bindingCompleted && hasVocabularyTable">
          新增 {{ vocabularyResults.filter((row) => row.status === 'CREATED').length }} 条 · 更新
          {{ vocabularyResults.filter((row) => row.status === 'UPDATED').length }} 条 · 跳过
          {{ vocabularyResults.filter((row) => row.status === 'SKIPPED').length }} 条
        </p>
        <p>
          {{
            bindingCompleted
              ? '对应来源版本已保存，后续仍需内容校对与发布确认'
              : '离开页面后可通过素材批次继续恢复查看'
          }}
        </p></AdminPanel
      >
      <AdminPanel title="导入结果" class="material-card"
        ><ElTable :data="previewRows"
          ><ElTableColumn label="条目 ID / 文件" min-width="220"
            ><template #default="{ row }">{{ row.entry_id || row.path }}</template></ElTableColumn
          ><ElTableColumn label="当前释义" prop="meaning" min-width="180" /><ElTableColumn
            label="结果"
            min-width="230"
            ><template #default="{ row }">{{
              hasVocabularyTable
                ? vocabularyResults.find((result) => result.import_entry_id === row.entry_id)
                    ?.status === 'CREATED'
                  ? '新增成功'
                  : vocabularyResults.find((result) => result.import_entry_id === row.entry_id)
                        ?.status === 'UPDATED'
                    ? '更新成功'
                    : vocabularyResults.find((result) => result.import_entry_id === row.entry_id)
                          ?.status === 'SKIPPED'
                      ? '完全相同，已跳过'
                      : '等待实际逐行结果'
                : bindingCompleted
                  ? '已完成当前草稿素材关联'
                  : '等待后台处理结果'
            }}</template></ElTableColumn
          ></ElTable
        >
        <p class="caption">
          实际素材绑定完成后可继续本批校对，任务提交回执不代表已保存或发布。
        </p></AdminPanel
      >
    </template>
    <AppPageActions
      ><ElButton v-if="phase === 'upload'" :disabled="busy" @click="returnToImport"
        >返回批量导入</ElButton
      ><ElButton
        v-else-if="phase === 'result'"
        :disabled="busy"
        @click="run(() => read(recoveryId))"
        >刷新导入结果</ElButton
      ><ElButton
        v-else
        :disabled="busy"
        @click="phase = phase === 'preview' ? 'validation' : 'upload'"
        >上一步</ElButton
      ><ElButton
        v-if="phase === 'upload'"
        :disabled="
          busy ||
          !file ||
          !context.seriesId ||
          !adapter.available ||
          (hasVocabularyTable && !target)
        "
        :loading="busy"
        type="primary"
        @click="upload"
        >开始校验</ElButton
      ><ElButton
        v-else-if="phase === 'validation'"
        :disabled="busy || !canPreview || !['PREVIEW_READY', 'BOUND'].includes(batch?.status || '')"
        type="primary"
        @click="showPreview"
        >查看合格预览</ElButton
      ><ElButton
        v-else-if="phase === 'preview'"
        :disabled="busy || !ready"
        :loading="busy"
        type="primary"
        @click="bind"
        >确认导入</ElButton
      ><ElButton
        v-if="phase === 'result' && command && !submittedStage"
        :disabled="busy"
        @click="resumeUnknown"
        >续办原绑定</ElButton
      ><ElButton
        v-if="bindingError && command && !bindingCompleted"
        :disabled="busy"
        @click="retryFailed"
        >重试本次失败绑定</ElButton
      ><ElButton v-if="bindingCompleted" :disabled="busy" type="primary" @click="continueWorkOrder"
        >继续本批校对</ElButton
      ><ElButton v-if="phase === 'result'" :disabled="busy" @click="startNew">{{
        hasVocabularyTable ? '导入新图包' : '上传新素材'
      }}</ElButton></AppPageActions
    >
  </section>
</template>

<style scoped lang="scss">
.content-materials-panel {
  display: grid;
  gap: 20px;
  min-width: 0;

  .material-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    span {
      padding: 14px 16px;
      border-radius: 10px;
      background: var(--juya-color-surface);
      color: var(--juya-color-text-secondary);
      font-size: 13px;
    }

    .active {
      background: var(--juya-color-primary-soft);
      color: var(--juya-color-primary);
      font-weight: 700;
    }
  }

  .material-card {
    border-radius: 14px;

    --juya-panel-title-size: 18px;
    --juya-panel-title-line-height: 29px;
  }

  .material-card :deep([class~='el-card__header']) {
    padding: 24px 24px 16px;
    border-bottom: 0;
  }

  .material-card :deep([class~='el-card__body']) {
    padding: 0 24px 24px;
  }

  p {
    font-size: 14px;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 16px 0;
  }

  .actions > :deep(.el-select),
  .actions > :deep(.el-input) {
    flex: 1 1 180px;
  }

  .selected-package {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border-radius: 12px;
    background: var(--juya-color-primary-soft);

    strong {
      display: block;
      font-size: 18px;
    }

    small {
      display: block;
      margin-top: 8px;
      color: var(--juya-color-text-secondary);
      font-size: 12px;
    }
  }

  .binding-row {
    display: grid;
    grid-template-columns: minmax(180px, 2fr) auto minmax(140px, 1fr) minmax(160px, 1fr);
    gap: 12px;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--juya-color-border-light);

    strong {
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    p {
      margin: 6px 0 0;
      color: var(--juya-color-text-secondary);
      font-size: 12px;
    }
  }

  :deep(.el-table) {
    --el-table-header-bg-color: var(--juya-color-primary-soft);
    --el-table-tr-bg-color: var(--juya-color-surface);

    font-size: 14px;
  }

  :deep(th) {
    color: var(--juya-color-primary);
  }

  .caption {
    margin: 12px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .result-card {
    text-align: center;

    :deep([class~='el-card__body']) {
      padding: 28px 24px;
    }

    h2 {
      margin: 16px 0 8px;
      font-size: 22px;
    }

    .result-status {
      color: var(--juya-color-primary);
      font-size: 16px;
    }

    p {
      color: var(--juya-color-text-secondary);
      margin: 0;
    }
  }

  @media (width <= 1000px) {
    .binding-row {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (width <= 700px) {
    .material-steps {
      grid-template-columns: 1fr 1fr;
    }

    .binding-row {
      grid-template-columns: 1fr;
    }

    .selected-package {
      flex-wrap: wrap;
    }
  }
}
</style>

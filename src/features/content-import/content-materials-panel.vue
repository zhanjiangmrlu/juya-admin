<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
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
import ImportResourcePreview from './import-resource-preview.vue'

const client = useAdminApiClient()
const router = useRouter()
const route = useRoute()
const recoveryBatch = String(route.query.material_batch_id || '')
const recoveryStage = String(route.query.material_stage_id || '')
const props = defineProps<{ initialSeriesId?: string; initialContentType?: string }>()
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
const hasVocabularyTable = computed(() =>
  Array.isArray((batch.value?.manifest as Record<string, unknown> | undefined)?.vocabulary_rows)
)
const checked = ref(false)
const busy = ref(false)
const error = ref('')
const phase = ref<'upload' | 'validation' | 'preview' | 'result'>('upload')
const submittedStage = ref('')
const steps = ['上传 ZIP', '校验', '图文预览', '确认导入']
const phaseIndex = computed(() =>
  ['upload', 'validation', 'preview', 'result'].indexOf(phase.value)
)
const bindingResult = computed(() => {
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
    route.query.material_stage_id
  ],
  () => {
    if (route.name !== 'content-import' || route.query.source !== 'materials') return
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
        material_phase: actualPhase,
        material_batch_id: batch.value?.batch_id,
        material_stage_id: submittedStage.value || undefined
      }
    })
  },
  { flush: 'post' }
)
const previewRows = computed(() =>
  hasVocabularyTable.value
    ? chosenVocabulary.value.map((row) => ({
        path: row.image_path || '',
        entry_id: row.import_entry_id,
        english: row.english,
        meaning: row.meaning_zh,
        source: targets.value.find((item) => item.revisionId === targetId.value)?.title || '—',
        role: 'WORD_IMAGE',
        operation: row.operation,
        previous: row.previous
      }))
    : selected.value.map((binding) => {
        const entry = roleEntries(binding.role).find((item) => item.entry_id === binding.entry_id)
        return {
          ...binding,
          english: entry?.english || '—',
          meaning: entry?.chinese || '—',
          source: targets.value.find((item) => item.revisionId === targetId.value)?.title || '—',
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
    (hasVocabularyTable.value
      ? !!vocabularyHash.value &&
        chosenVocabulary.value.length > 0 &&
        chosenVocabulary.value.every(
          (row) =>
            !row.issues.some((issue) => issue.severity === 'ERROR') &&
            (!!row.image_path || row.noImageConfirmed)
        )
      : selected.value.length > 0)
)
const entries = computed(() => (target.value ? normalizeSceneContent(target.value.content) : null))
const ready = computed(
  () =>
    !!target.value &&
    target.value.revisionId === targetId.value &&
    checked.value &&
    (hasVocabularyTable.value
      ? !!vocabularyHash.value &&
        chosenVocabulary.value.length > 0 &&
        chosenVocabulary.value.every(
          (row) =>
            !row.issues.some((issue) => issue.severity === 'ERROR') &&
            (!!row.image_path || row.noImageConfirmed) &&
            (row.operation !== 'UPDATE' || row.differenceConfirmed)
        )
      : selected.value.length > 0 &&
        selected.value.every(
          (row) =>
            row.role &&
            (!['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(row.role) || row.entry_id)
        ) &&
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
    const value = await adapter.load(id)
    if (disposed) return
    if (batch.value?.batch_id !== value.batch_id) {
      target.value = null
      targetId.value = ''
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
    batch.value = value
    recoveryId.value = value.batch_id
    if (phase.value === 'upload') phase.value = 'validation'
  }
const /**
   * 更换本地素材包时更换上传身份
   * @param value - 管理员重新选择的 ZIP
   */ selectFile = (value: UploadFile): void => {
    file.value = value.raw || null
    uploadKey = createIdempotencyKey()
    phase.value = 'upload'
    submittedStage.value = ''
  }
const /** 上传明确系列和模板的独立素材 ZIP
   * @returns 上传与恢复结果完成状态
   */ upload = async (): Promise<void> =>
    run(async () => {
      if (!file.value || !context.seriesId) return
      const value = await adapter.upload(file.value, context.seriesId, context.type, uploadKey)
      await read(value.batch_id)
    })
const /** 加载当前页可编辑草稿，标题建议不自动采用
   * @returns 草稿加载完成状态
   */ loadTargets = async (): Promise<void> =>
    run(async () => {
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
      if (disposed) return
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
   */ loadTarget = async (): Promise<void> =>
    run(async () => {
      target.value = null
      checked.value = false
      const row = targets.value.find((item) => item.revisionId === targetId.value)
      if (!row) return
      const value =
        context.type === 'short_reading'
          ? await readings.load(row.id)
          : await content.getRevision(row.revisionId)
      if (disposed) return
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
        if (disposed || targetId.value !== row.revisionId) return
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
    })
const /** 明确绑定选中文件，网络不确定时保留相同命令身份
   * @returns 绑定命令完成状态
   */ bind = async (): Promise<void> =>
    run(async () => {
      if (!ready.value || !target.value || !batch.value) return
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
      try {
        const receipt = hasVocabularyTable.value
          ? await client.request<{ stage_id: string }>({
              method: 'POST',
              path: `/api/v1/admin/content-materials/${encodeURIComponent(batch.value.batch_id)}/bindings`,
              headers: { 'Idempotency-Key': bindKey },
              body: {
                revision_id: target.value.revisionId,
                expected_version: target.value.version,
                manual_checked: true,
                bindings: [],
                vocabulary_preview_hash: vocabularyHash.value,
                vocabulary_selections: chosenVocabulary.value.map((row) => ({
                  import_entry_id: row.import_entry_id,
                  no_image_confirmed: row.noImageConfirmed,
                  difference_confirmed: row.differenceConfirmed
                }))
              }
            })
          : await adapter.bind(
              batch.value.batch_id,
              target.value.revisionId,
              target.value.version,
              rows,
              bindKey
            )
        submittedStage.value = String((receipt as { stage_id?: string }).stage_id || '')
        phase.value = 'result'
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 409) {
          target.value = null
          checked.value = false
        }
        throw failure
      }
      checked.value = false
      await read(batch.value.batch_id)
    })
const /**
   * 获取本篇角色所需的稳定词条
   * @param role - 文件正在绑定的角色
   * @returns 本篇词汇或语块
   */ roleEntries = (role: string) =>
    role === 'CHUNK_AUDIO' ? entries.value?.chunks || [] : entries.value?.vocabulary || []
const /** 进入固定草稿的图文核对，不自动确认任何文件
   * @returns 切换预览状态
   */ showPreview = (): void => {
    checked.value = false
    phase.value = 'preview'
  }
const /** 恢复上传入口，已有完成结果仍保留在服务端
   * @returns 新包上传状态
   */ startNew = (): void => {
    phase.value = 'upload'
    submittedStage.value = ''
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
    void router.push({ name: 'content-import' })
  }
const /** 素材实际绑定后桥接工作单，保留对应正文范围 */
  continueWorkOrder = async (): Promise<void> => {
    if (!bindingCompleted.value || !batch.value) return
    await run(async () => {
      const order = await createWorkOrderAdapter(client).fromBatch(batch.value!.batch_id)
      await router.push({ name: 'content-work-order', params: { id: order.work_order_id } })
    })
  }
onMounted(() => {
  if (route.name !== 'content-import' || route.query.source !== 'materials') return
  // URL 的阶段只用于展示；恢复结果必须读取实际批次与任务记录。
  void router.replace({
    name: 'content-import',
    query: { ...route.query, material_phase: 'upload' }
  })
  if (!recoveryBatch) return
  void run(async () => {
    await read(recoveryBatch)
    const manifest = batch.value?.manifest as Record<string, unknown> | undefined
    const requests = manifest?.binding_requests as
      Record<string, { request?: Record<string, unknown> }> | undefined
    const request = requests?.[recoveryStage]?.request
    if (!request) return
    submittedStage.value = recoveryStage
    if (Array.isArray(request.bindings))
      bindings.value = (request.bindings as MaterialBinding[]).map((row) => ({
        ...row,
        selected: true
      }))
    if (Array.isArray(request.vocabulary_selections) && Array.isArray(manifest?.vocabulary_rows)) {
      const ids = new Set(
        (request.vocabulary_selections as { import_entry_id: string }[]).map(
          (row) => row.import_entry_id
        )
      )
      vocabularyRows.value = (manifest.vocabulary_rows as VocabularyRow[]).map((row) => ({
        ...row,
        selected: ids.has(row.import_entry_id),
        noImageConfirmed: false,
        differenceConfirmed: false
      }))
    }
    phase.value = 'result'
  })
})
</script>
<template>
  <section class="content-materials-panel">
    <nav class="material-steps" aria-label="词汇图包导入步骤">
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
    <template v-if="phase === 'upload'">
      <AdminPanel title="词汇与图片，一次上传" class="material-card">
        <p>
          将对应素材放入同一个
          ZIP，选择来源内容后按稳定条目核对。英文和当前释义保留为可编辑文字，图片不提取文字。
        </p>
        <div class="actions">
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
        <div class="selected-package">
          <div>
            <strong>{{ file?.name || '选择词汇图片 / 音频 ZIP' }}</strong
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
              file ? '更换 ZIP' : '选择独立素材 ZIP'
            }}</ElButton></ElUpload
          >
        </div>
      </AdminPanel>
      <AdminPanel title="每条词汇都有自己的图片路径" class="material-card"
        ><ElTable
          :data="[
            { field: '来源内容', rule: '选择已保存的内容草稿，英文与当前释义来自该篇' },
            { field: '条目 ID', rule: '按稳定条目区分同词不同语境，不按英文合并' },
            { field: '图片路径', rule: '明确选择包内文件与本篇条目，不按行号猜测' }
          ]"
          ><ElTableColumn label="对应字段" prop="field" min-width="150" /><ElTableColumn
            label="核对规则"
            prop="rule"
            min-width="300"
        /></ElTable>
        <p class="caption">
          图片和音频由管理员确认角色；已有用户收藏资料不被后台更新自动改写。
        </p></AdminPanel
      >
    </template>
    <AdminPanel
      v-if="phase === 'validation' || (phase === 'upload' && recoveryId)"
      class="material-card"
      title="图包校验与恢复"
    >
      <div class="actions">
        <ElButton :disabled="busy || !recoveryId.trim()" @click="run(() => read(recoveryId.trim()))"
          >恢复 / 刷新素材结果</ElButton
        >
      </div>
      <template v-if="batch">
        <p>
          {{ batch.manifest.resources?.length ?? 0 }}份素材 ·
          {{
            ['PREVIEW_READY', 'BOUND'].includes(batch.status)
              ? '文件校验已完成，请核对来源与条目'
              : '正在处理或需要恢复，请刷新结果'
          }}
        </p>
        <div class="actions">
          <ElInputNumber
            v-model="context.page"
            :min="1"
            :precision="0"
            aria-label="素材草稿页码"
          /><ElButton :loading="busy" @click="loadTargets">加载本页目标草稿</ElButton
          ><ElSelect
            v-model="targetId"
            aria-label="素材目标草稿"
            placeholder="明确选择来源草稿"
            :disabled="busy"
            ><ElOption
              v-for="row in targets"
              :key="row.revisionId"
              :label="`${row.title} · ${row.revisionId}`"
              :value="row.revisionId" /></ElSelect
          ><ElButton :disabled="busy || !targetId" @click="loadTarget">读取固定草稿</ElButton>
        </div>
        <ElAlert
          v-if="missingDraftCount"
          :title="`本页 ${missingDraftCount} 篇内容尚无可编辑草稿；请先在内容生产生成候选版本，再加载素材目标。`"
          type="info"
          :closable="false"
          ><RouterLink to="/content/scenes">前往内容生产生成候选版本</RouterLink></ElAlert
        >
        <p v-if="target">
          来源：{{ targets.find((row) => row.revisionId === targetId)?.title }} · 当前编辑版本
          {{ target.version }}
        </p>
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
              ><span v-if="row.image_path">{{ row.image_path }}</span
              ><ElCheckbox
                v-else
                v-model="row.noImageConfirmed"
                :disabled="busy"
                @change="checked = false"
                >明确确认无图</ElCheckbox
              ></template
            ></ElTableColumn
          >
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
                v-for="role in resource.allowed_roles.filter(
                  (role) => context.type !== 'word_card' || role !== 'WHOLE_AUDIO'
                )"
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
      <AdminPanel title="逐条确认图片、英文与当前释义" class="material-card"
        ><p>本次明确选择 {{ chosenCount }}条资料，来源与版本固定后再确认导入。</p>
        <ElTable :data="previewRows" class="preview-table"
          ><ElTableColumn label="图片 / 音频" min-width="150"
            ><template #default="{ row }"
              ><ImportResourcePreview
                v-if="row.path"
                source="materials"
                :batch-id="batch.batch_id"
                :path="row.path"
                :disabled="busy"
              /><span v-else>无图已确认</span></template
            ></ElTableColumn
          ><ElTableColumn label="条目 ID" prop="entry_id" min-width="160" /><ElTableColumn
            label="英文"
            prop="english"
            min-width="120"
          /><ElTableColumn label="当前释义" prop="meaning" min-width="140" /><ElTableColumn
            label="来源"
            prop="source"
            min-width="160"
          /><ElTableColumn label="本次操作" min-width="140"
            ><template #default="{ row }">{{
              row.operation === 'CREATE'
                ? '新增条目'
                : row.operation === 'UPDATE'
                  ? '更新当前条目'
                  : row.operation === 'SKIP'
                    ? '跳过完全重复记录'
                    : `关联${roleLabels[row.role] || '素材'}`
            }}</template></ElTableColumn
          ></ElTable
        ></AdminPanel
      >
      <AdminPanel title="同一条目：核对后再确认更新" class="material-card"
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
          {{ bindingCompleted ? '选中素材已关联至来源草稿' : '导入任务已提交，尚未完成绑定' }}
        </h2>
        <ElAlert
          v-if="bindingError"
          :title="`当前导入失败：${bindingError}。原文件与草稿已保留，请修正后恢复。`"
          :closable="false"
          type="error"
        />
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
        :disabled="busy || !file || !context.seriesId || !adapter.available"
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
      ><ElButton v-if="bindingCompleted" :disabled="busy" type="primary" @click="continueWorkOrder"
        >继续本批校对</ElButton
      ><ElButton v-if="phase === 'result'" :disabled="busy" @click="startNew"
        >导入新图包</ElButton
      ></AppPageActions
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

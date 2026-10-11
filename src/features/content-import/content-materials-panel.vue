<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
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
const adapter = createContentMaterialsAdapter(client)
const content = createContentAdapter(client)
const readings = createShortReadingAdapter(client)
const context = reactive({ seriesId: '', type: 'word_card', page: 1 })
const series = ref<ContentSeries[]>([])
const file = shallowRef<NonNullable<UploadFile['raw']> | null>(null)
const recoveryId = ref('')
const batch = shallowRef<MaterialBatch | null>(null)
const targets = ref<{ id: string; revisionId: string; title: string }[]>([])
const targetId = ref('')
const target = shallowRef<{
  revisionId: string
  version: number
  content: Record<string, unknown>
} | null>(null)
const bindings = ref<(MaterialBinding & { selected: boolean })[]>([])
const checked = ref(false)
const busy = ref(false)
const error = ref('')
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
const entries = computed(() => (target.value ? normalizeSceneContent(target.value.content) : null))
const ready = computed(
  () =>
    !!target.value &&
    target.value.revisionId === targetId.value &&
    checked.value &&
    selected.value.length > 0 &&
    selected.value.every(
      (row) =>
        row.role &&
        (!['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(row.role) || row.entry_id)
    ) &&
    new Set(selected.value.map((row) => `${row.role}:${row.entry_id || ''}`)).size ===
      selected.value.length &&
    ['PREVIEW_READY', 'BOUND'].includes(batch.value?.status || '')
)
watch(targetId, () => {
  target.value = null
  checked.value = false
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
  }
const /**
   * 更换本地素材包时更换上传身份
   * @param value - 管理员重新选择的 ZIP
   */ selectFile = (value: UploadFile): void => {
    file.value = value.raw || null
    uploadKey = createIdempotencyKey()
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
      if (context.type === 'short_reading') {
        const value = await client.request<{
          items: { public_id: string; series_id: string; draft_revision_id: string | null }[]
        }>({
          method: 'GET',
          path: '/api/v1/admin/content/short-readings',
          query: { page: context.page, page_size: 100 }
        })
        const rows = await Promise.all(
          value.items
            .filter((row) => row.series_id === context.seriesId && row.draft_revision_id)
            .map((row) => readings.load(row.public_id))
        )
        if (!disposed)
          targets.value = rows.map((row) => ({
            id: row.id,
            revisionId: row.revisionId,
            title: row.content.title_zh || row.content.title_en
          }))
      } else {
        const value = await content.listScenes({
          page: context.page,
          pageSize: 100,
          query: '',
          seriesId: context.seriesId,
          status: 'DRAFT'
        })
        if (!disposed)
          targets.value = value.items
            .filter(
              (row) =>
                row.draftRevisionId &&
                (context.type === 'word_card'
                  ? ['vocabulary', 'word_card'].includes(row.templateType || '')
                  : row.templateType === 'dialogue' || !row.templateType)
            )
            .map((row) => ({ id: row.id, revisionId: row.draftRevisionId!, title: row.title }))
      }
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
      target.value = {
        revisionId: row.revisionId,
        version: 'editVersion' in value ? value.editVersion : value.version,
        content: { ...value.content }
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
        rows
      ])
      if (signature !== bindSignature) {
        bindSignature = signature
        bindKey = createIdempotencyKey()
      }
      try {
        await adapter.bind(
          batch.value.batch_id,
          target.value.revisionId,
          target.value.version,
          rows,
          bindKey
        )
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
</script>

<template>
  <AdminPanel title="独立词汇图片 / 音频 ZIP" class="content-materials-panel">
    <p>
      旧内容和 DOCX 草稿可补充素材。标题匹配仅是建议；选择固定草稿、文件角色和稳定词条后再确认绑定。
    </p>
    <ElAlert
      v-if="!adapter.available"
      title="独立素材包接口等待装配"
      type="warning"
      :closable="false"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <div class="actions">
      <ElButton :loading="busy" @click="loadTargets">加载素材分类 / 草稿</ElButton>
      <ElSelect
        v-model="context.seriesId"
        aria-label="素材目标分类"
        placeholder="目标分类"
        :disabled="busy"
        ><ElOption v-for="row in series" :key="row.id" :value="row.id" :label="row.title"
      /></ElSelect>
      <ElSelect v-model="context.type" aria-label="素材内容模板" :disabled="busy"
        ><ElOption label="原词汇卡" value="word_card" /><ElOption
          label="场景对话"
          value="dialogue" /><ElOption label="独立短文" value="short_reading"
      /></ElSelect>
      <ElUpload
        :auto-upload="false"
        :show-file-list="false"
        accept=".zip"
        :disabled="busy || !adapter.available"
        @change="selectFile"
        ><ElButton :disabled="busy || !adapter.available">选择独立素材 ZIP</ElButton></ElUpload
      >
      <ElButton :disabled="busy || !file || !context.seriesId || !adapter.available" @click="upload"
        >上传独立素材包</ElButton
      >
    </div>
    <p v-if="file">{{ file.name }} · {{ file.size }} 字节</p>
    <div class="actions">
      <ElInput
        v-model="recoveryId"
        aria-label="素材批次编号"
        placeholder="恢复素材批次编号"
      /><ElButton :disabled="busy || !recoveryId.trim()" @click="run(() => read(recoveryId.trim()))"
        >恢复 / 刷新素材结果</ElButton
      >
    </div>
    <template v-if="batch">
      <p>批次 {{ batch.batch_id }} · {{ batch.status }}</p>
      <p>逐项预览原始素材并核对路径与角色；标题建议不会自动成为绑定，预览不代替安全审核</p>
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
          placeholder="明确选择草稿"
          :disabled="busy"
          ><ElOption
            v-for="row in targets"
            :key="row.revisionId"
            :label="`${row.title} · ${row.revisionId}`"
            :value="row.revisionId" /></ElSelect
        ><ElButton :disabled="busy || !targetId" @click="loadTarget">读取固定草稿</ElButton>
      </div>
      <p v-if="target">
        目标 {{ targets.find((row) => row.revisionId === targetId)?.title }} ·
        {{ target.revisionId }} · 编辑版本 {{ target.version }}
      </p>
      <article v-for="(resource, index) in batch.manifest.resources || []" :key="resource.path">
        <p>{{ resource.path }} · {{ resource.sha256 }}</p>
        <ImportResourcePreview :batch-id="batch.batch_id" :path="resource.path" :disabled="busy" />
        <p v-if="resource.matching_candidates.length">
          标题建议：{{
            resource.matching_candidates
              .map((row) => `${row.title_en} (${row.revision_id})`)
              .join('；')
          }}{{ resource.ambiguous_title ? ' · 同名冲突，需逐项核对' : '' }}
        </p>
        <template v-if="bindings[index]">
          <ElCheckbox v-model="bindings[index]!.selected" :disabled="busy"
            >明确绑定这个文件</ElCheckbox
          >
          <ElSelect
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
              :label="roleLabels[role] || role"
          /></ElSelect>
          <ElSelect
            v-if="['WORD_IMAGE', 'WORD_AUDIO', 'CHUNK_AUDIO'].includes(bindings[index]!.role)"
            v-model="bindings[index]!.entry_id"
            :disabled="busy || !target"
            :aria-label="`素材词条 ${index + 1}`"
            placeholder="本篇稳定词条"
            ><ElOption
              v-for="entry in roleEntries(bindings[index]!.role)"
              :key="entry.entry_id"
              :label="`${entry.english} · ${entry.chinese} · ${entry.entry_id}`"
              :value="entry.entry_id"
          /></ElSelect>
        </template>
      </article>
      <ElCheckbox v-model="checked" :disabled="busy || !target"
        >已逐项核对文件、角色、当前草稿和稳定词条</ElCheckbox
      >
      <ElButton :disabled="busy || !ready" type="primary" @click="bind"
        >确认绑定选中 {{ selected.length }} 个文件</ElButton
      >
      <ElButton
        :disabled="busy || batch.status === 'CANCELLED'"
        @click="
          run(async () => {
            await adapter.cancel(batch!.batch_id)
            await read(batch!.batch_id)
          })
        "
        >取消此素材批次</ElButton
      >
      <details v-if="batch.manifest.binding_requests">
        <summary>持久化绑定任务与执行结果</summary>
        <pre>{{ JSON.stringify(batch.manifest, null, 2) }}</pre>
      </details>
    </template>
  </AdminPanel>
</template>

<style scoped lang="scss">
.content-materials-panel {
  min-width: 0;

  p,
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 12px 0;
  }

  .actions > :deep(.el-select),
  .actions > :deep(.el-input) {
    flex: 1 1 220px;
  }

  article {
    display: grid;
    gap: 10px;
    margin: 12px 0;
    padding: 16px;
    border: 1px solid var(--juya-color-border);
    border-radius: 12px;
  }
}
</style>

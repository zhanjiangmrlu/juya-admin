<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type {
  CandidateKind,
  CandidateSelection,
  ProductionCandidate
} from './content-candidate-adapter'
import type { SceneRevision } from '@/features/content/content-model'
import type { SceneContent } from '@/features/content-editor/scene-form'

import {
  candidateBelongsToRevision,
  createContentCandidateAdapter,
  validCandidateSelection
} from './content-candidate-adapter'

const props = defineProps<{
  revisionId: string
  expectedVersion: number
  form: SceneContent
  dirty: boolean
  disabled: boolean
  kind: CandidateKind
  prepare: () => Promise<SceneRevision | null>
}>()
const emit = defineEmits<{ saved: [revision: SceneRevision]; busy: [value: boolean] }>()
const client = useAdminApiClient()
const adapter = createContentCandidateAdapter(client)
const content = createContentAdapter(client)
const identifier = ref('')
const result = shallowRef<ProductionCandidate | null>(null)
const rows = ref<(CandidateSelection & { entryType: 'VOCABULARY' | 'PHRASE'; checked: boolean })[]>(
  []
)
const busy = ref(false)
const error = ref('')
let sequence = 0
let disposed = false
const origins = new Map<string, string>()
const current = computed(
  () =>
    result.value?.candidate.kind === props.kind &&
    candidateBelongsToRevision(result.value, props.revisionId, origins.get(result.value.id)) &&
    result.value.candidate.edit_version === props.expectedVersion &&
    !props.dirty &&
    Object.entries(result.value.candidate.sources).every(([id, text]) =>
      props.form.dialogue.some((line) => line.id === id && line.english === text)
    ) &&
    (props.kind !== 'ASR_BOUNDARY' ||
      result.value.candidate.audio?.version_id === props.form.audio?.version_id)
)
const asr = computed(() => {
  const value = result.value?.candidate.results
  return value && !Array.isArray(value) ? value : null
})
watch(
  () => [props.revisionId, props.expectedVersion, props.dirty],
  () => {
    sequence++
    rows.value.forEach((row) => {
      row.checked = false
    })
  }
)
onBeforeUnmount(() => {
  disposed = true
  sequence++
  emit('busy', false)
})

const /**
   * 从固定任务读取候选，晚到的结果不覆盖新草稿
   * @param id - 要恢复的服务端任务编号
   */ read = async (id: string): Promise<void> => {
    const token = ++sequence
    const value = await adapter.get(id)
    if (disposed || token !== sequence) return
    if (value.id !== id) throw new Error('候选任务响应与请求编号不一致')
    result.value = value
    rows.value = Array.isArray(value.candidate.results)
      ? value.candidate.results.map((row) => ({ ...row, entryType: 'VOCABULARY', checked: false }))
      : []
  }
const /**
   * 管理员明确创建、恢复或采纳；创建前保存，采纳保持固定版本
   * @param action - 本次任务操作
   * @param index - 明确采纳的单项结果序号
   */ run = async (action: 'queue' | 'refresh' | 'adopt', index = -1): Promise<void> => {
    if (busy.value || props.disabled) return
    busy.value = true
    error.value = ''
    const revisionId = props.revisionId
    try {
      if (action === 'queue') {
        const saved = await props.prepare()
        if (!saved || disposed || revisionId !== props.revisionId) return
        emit('busy', true)
        const queued = await adapter.queue(saved.id, saved.version, props.kind)
        if (disposed || revisionId !== props.revisionId) return
        identifier.value = queued.candidate_id
        origins.set(queued.candidate_id, saved.id)
        result.value = null
        rows.value = []
        await read(identifier.value)
      } else if (action === 'refresh') await read(identifier.value.trim())
      else {
        const row = rows.value[index]
        if (
          !row?.checked ||
          !current.value ||
          result.value?.status !== 'READY' ||
          !validCandidateSelection(row, result.value.candidate.sources)
        )
          return
        const token = sequence
        emit('busy', true)
        await adapter.adopt(result.value.id, index, row, props.expectedVersion, row.entryType)
        const saved = await content.getRevision(revisionId)
        if (disposed || revisionId !== props.revisionId || token !== sequence) return
        result.value = null
        rows.value = []
        emit('saved', saved)
      }
    } catch (failure) {
      if (!disposed && revisionId === props.revisionId)
        error.value = failure instanceof Error ? failure.message : '任务未完成，请核对后重试'
    } finally {
      busy.value = false
      emit('busy', false)
    }
  }
</script>

<template>
  <AdminPanel
    :title="kind === 'AI_LEXICON' ? '词汇与语块候选' : '音文对齐参考'"
    class="content-candidates-panel"
  >
    <p>
      {{
        kind === 'AI_LEXICON'
          ? '只对尚无本篇词条的来源句请求候选。采纳前核对原句位置与本篇中文，保存后仍需确认词条。'
          : '固定整段音频与双语正文生成参考；逐句边界需人工调整、重切并试听真实文件。'
      }}
    </p>
    <div class="actions">
      <ElButton :disabled="disabled" :loading="busy" @click="run('queue')"
        >保存并请求{{ kind === 'AI_LEXICON' ? '词库候选' : 'ASR参考' }}</ElButton
      >
      <ElInput
        v-model="identifier"
        aria-label="候选任务编号"
        placeholder="任务编号，可恢复已有任务"
        :disabled="busy"
      />
      <ElButton :disabled="!identifier.trim() || disabled" :loading="busy" @click="run('refresh')"
        >恢复 / 刷新候选</ElButton
      >
    </div>
    <p>请求将使用服务端配置及硬预算，不会自动重复创建任务</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="result">
      <p>任务 {{ result.id }} · {{ result.status }} · 草稿 v{{ result.candidate.edit_version }}</p>
      <ElAlert
        v-if="!candidateBelongsToRevision(result, revisionId, origins.get(result.id))"
        title="候选所属草稿与当前草稿不一致或无法核验，当前只供参考，不能采纳"
        type="warning"
        :closable="false"
      />
      <ElAlert
        v-if="!current"
        title="草稿或音频依赖已变化，请先保存并重新核对候选"
        type="warning"
        :closable="false"
      />
      <template v-if="result.status === 'READY' && kind === 'AI_LEXICON'">
        <article v-for="(row, index) in rows" :key="index">
          <strong>{{ row.english }}</strong>
          <p class="source">{{ result.candidate.sources[row.source_id] }}</p>
          <ElForm label-position="top">
            <ElFormItem label="本篇中文"
              ><ElInput v-model="row.chinese" :aria-label="`候选中文 ${index + 1}`"
            /></ElFormItem>
            <div class="bounds">
              <ElFormItem label="来源起点（从0计数）"
                ><ElInputNumber v-model="row.start" :min="0" :precision="0"
              /></ElFormItem>
              <ElFormItem label="来源终点（不含）"
                ><ElInputNumber v-model="row.end" :min="1" :precision="0"
              /></ElFormItem>
              <ElFormItem label="采纳类型"
                ><ElSelect v-model="row.entryType"
                  ><ElOption label="词汇" value="VOCABULARY" /><ElOption
                    label="语块"
                    value="PHRASE" /></ElSelect
              ></ElFormItem>
            </div>
            <ElCheckbox v-model="row.checked">已核对准确来源位置和本篇中文</ElCheckbox>
            <ElButton
              :disabled="
                disabled ||
                busy ||
                !current ||
                !row.checked ||
                !validCandidateSelection(row, result.candidate.sources)
              "
              @click="run('adopt', index)"
              >采纳这一项</ElButton
            >
          </ElForm>
        </article>
        <p>当前接口每次采纳一项后结束该候选；其他来源可再次明确请求</p>
      </template>
      <template v-if="result.status === 'READY' && asr">
        <p class="source">{{ asr.text }}</p>
        <ElTable :data="asr.boundaries"
          ><ElTableColumn type="index" label="参考段" /><ElTableColumn
            prop="start_ms"
            label="开始（毫秒）" /><ElTableColumn prop="end_ms" label="结束（毫秒）"
        /></ElTable>
        <p>参考段不自动对应句子，不写入已确认时间；请在逐句切片中核对</p>
      </template>
    </template>
  </AdminPanel>
</template>

<style scoped lang="scss">
.content-candidates-panel {
  min-width: 0;

  .actions,
  .bounds {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: end;
  }

  .actions > :deep(.el-input) {
    flex: 1 1 230px;
  }

  .bounds > :deep(.el-form-item) {
    flex: 1 1 180px;
  }

  article {
    padding: 16px;
    margin-top: 14px;
    border: 1px solid var(--juya-color-border);
    border-radius: 12px;
  }

  .source {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
</style>

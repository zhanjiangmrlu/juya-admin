<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import ContentStageRecoveryPanel from '@/features/content-import/content-stage-recovery-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  AudioProductionState,
  CandidateKind,
  CandidateSelection,
  ProductionCandidate
} from './content-candidate-adapter'
import type { SceneRevision } from '@/features/content/content-model'
import type { SceneContent } from '@/features/content-editor/scene-form'

import {
  audioProductionFailureLabel,
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
const productionState = shallowRef<AudioProductionState | null>(null)
const automaticLoading = ref(false)
const loadedRevisionKeys = new Set<string>()
let pollTimer: ReturnType<typeof globalThis.setTimeout> | undefined
const rows = ref<(CandidateSelection & { entryType: 'VOCABULARY' | 'PHRASE'; checked: boolean })[]>(
  []
)
const selectedIndex = ref(0)
const busy = ref(false)
const error = ref('')
const statusLabels: Record<string, string> = {
  PENDING: '等待处理',
  QUEUED: '已排队',
  SUBMITTING: '正在请求转录服务',
  SUBMITTED: '转录处理中',
  RUNNING: '处理中',
  READY: '处理完成',
  SUCCEEDED: '调度已完成',
  FAILED: '处理失败',
  UNKNOWN: '服务结果待核验，请恢复任务核对',
  CANCELLED: '已取消',
  REJECTED: '已拒绝',
  ADOPTED: '已采纳'
}
let sequence = 0
let disposed = false
const origins = new Map<string, string>()
const current = computed(
  () =>
    result.value?.candidate.kind === props.kind &&
    candidateBelongsToRevision(result.value, props.revisionId, origins.get(result.value.id)) &&
    (props.kind === 'ASR_BOUNDARY'
      ? result.value.stale === false
      : result.value.candidate.edit_version === props.expectedVersion) &&
    !props.dirty &&
    Object.entries(result.value.candidate.sources).every(([id, text]) =>
      props.form.dialogue.some((line) => line.id === id && line.english === text)
    ) &&
    (props.kind !== 'ASR_BOUNDARY' ||
      Object.keys(result.value.candidate.sources).length === props.form.dialogue.length) &&
    (props.kind !== 'ASR_BOUNDARY' ||
      (result.value.candidate.source_sentences?.length === props.form.dialogue.length &&
        result.value.candidate.source_sentences.every(
          (line, index) =>
            line.sentence_id === props.form.dialogue[index]?.id &&
            line.english === props.form.dialogue[index]?.english
        ))) &&
    (props.kind !== 'ASR_BOUNDARY' ||
      !asr.value?.applied_edit_version ||
      (asr.value.alignment?.length === props.form.dialogue.length &&
        asr.value.alignment.every(
          (line, index) => line.sentence_id === props.form.dialogue[index]?.id
        ))) &&
    (props.kind !== 'ASR_BOUNDARY' ||
      result.value.candidate.audio?.version_id === props.form.audio?.version_id)
)
const asr = computed(() => {
  const value = result.value?.candidate.results
  return value && !Array.isArray(value) ? value : null
})
onBeforeUnmount(() => {
  disposed = true
  sequence++
  globalThis.clearTimeout(pollTimer)
  emit('busy', false)
})
const /** 等待服务端已有任务，不自动重复提交收费任务 */ schedule = (): void => {
    globalThis.clearTimeout(pollTimer)
    if (!disposed && !props.dirty && props.kind === 'ASR_BOUNDARY')
      pollTimer = globalThis.setTimeout(() => void restoreLatest(), 2000)
  }
const /**
   * 展示已读取的固定候选，自动应用后只重载真实同源草稿
   * @param value - 服务端持久化候选
   * @param token - 本次读取的请求代次
   */ receive = async (value: ProductionCandidate, token: number): Promise<void> => {
    if (disposed || token !== sequence) return
    result.value = value
    identifier.value = value.id
    selectedIndex.value = 0
    rows.value = Array.isArray(value.candidate.results)
      ? value.candidate.results.map((row) => ({ ...row, entryType: 'VOCABULARY', checked: false }))
      : []
    const appliedVersion = asr.value?.applied_edit_version
    const key = `${value.id}:${appliedVersion}`
    if (
      props.kind === 'ASR_BOUNDARY' &&
      value.status === 'READY' &&
      appliedVersion &&
      current.value &&
      !props.disabled &&
      !loadedRevisionKeys.has(key)
    ) {
      const saved = await content.getRevision(props.revisionId)
      if (disposed || token !== sequence || props.dirty || props.disabled) return
      const savedForm = normalizeSceneContent(saved.content)
      if (
        saved.id !== props.revisionId ||
        saved.version < appliedVersion ||
        saved.version < props.expectedVersion ||
        savedForm.audio?.version_id !== props.form.audio?.version_id ||
        savedForm.dialogue.length !== props.form.dialogue.length ||
        !savedForm.dialogue.every((line, index) => line.id === props.form.dialogue[index]?.id) ||
        !savedForm.dialogue.every((line) => value.candidate.sources[line.id] === line.english)
      )
        return
      loadedRevisionKeys.add(key)
      emit('saved', saved)
    }
    if (
      value.stage_status !== 'FAILED' &&
      ['PENDING', 'QUEUED', 'SUBMITTING', 'SUBMITTED', 'RUNNING'].includes(value.status)
    )
      schedule()
  }
const /** 恢复当前草稿实际自动任务与候选；404仅表示尚未创建 */ restoreLatest =
    async (): Promise<void> => {
      if (disposed || props.dirty || props.kind !== 'ASR_BOUNDARY') return
      if (busy.value || props.disabled) {
        schedule()
        return
      }
      const token = ++sequence
      automaticLoading.value = true
      error.value = ''
      try {
        try {
          const state = await adapter.production(props.revisionId)
          if (disposed || token !== sequence) return
          productionState.value = state
        } catch (failure) {
          if (!(failure instanceof ApiError && failure.status === 404)) throw failure
          if (disposed || token !== sequence) return
          productionState.value = null
        }
        try {
          const value = await adapter.latest(props.revisionId, props.kind)
          if (!candidateBelongsToRevision(value, props.revisionId))
            throw new Error('自动任务不属于当前草稿，请重新读取')
          await receive(value, token)
        } catch (failure) {
          if (!(failure instanceof ApiError && failure.status === 404)) throw failure
          if (disposed || token !== sequence) return
          result.value = null
          if (
            productionState.value &&
            ['QUEUED', 'PENDING', 'RUNNING'].includes(productionState.value.status)
          )
            schedule()
        }
      } catch (failure) {
        if (!disposed && token === sequence)
          error.value = failure instanceof Error ? failure.message : '自动音频状态读取失败，请重试'
      } finally {
        if (token === sequence) automaticLoading.value = false
      }
    }
watch(
  () => [
    props.revisionId,
    props.expectedVersion,
    props.dirty,
    props.form.audio?.version_id,
    props.form.dialogue.map((line) => [line.id, line.english])
  ],
  () => {
    sequence++
    globalThis.clearTimeout(pollTimer)
    automaticLoading.value = false
    rows.value.forEach((row) => {
      row.checked = false
    })
    void restoreLatest()
  },
  { immediate: true, deep: true }
)

const /**
   * 从固定任务读取候选，晚到的结果不覆盖新草稿
   * @param id - 要恢复的服务端任务编号
   */ read = async (id: string): Promise<void> => {
    const token = ++sequence
    const value = await adapter.get(id)
    if (disposed || token !== sequence) return
    if (value.id !== id) throw new Error('候选任务响应与请求编号不一致')
    await receive(value, token)
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
    :title="kind === 'AI_LEXICON' ? '新词条与语块候选' : '自动音文对齐与切片'"
    class="content-candidates-panel"
  >
    <p>
      {{
        kind === 'AI_LEXICON'
          ? '只对尚无本篇词条的来源句请求候选。采纳前核对原句位置与本篇中文，保存后仍需确认词条。'
          : '保存整段音频与正文后自动匹配实际时间点并生成单句文件；正常结果进入抽样确认，异常句子需修正边界并重生成。'
      }}
    </p>
    <div class="actions">
      <ElButton :disabled="disabled" :loading="busy" @click="run('queue')">{{
        kind === 'AI_LEXICON' ? '保存并请求词库候选' : '保存并重新检查音文对齐'
      }}</ElButton>
      <ElButton
        v-if="kind === 'ASR_BOUNDARY'"
        :loading="automaticLoading"
        :disabled="busy || dirty || disabled"
        @click="restoreLatest"
        >刷新自动音频状态</ElButton
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
    <p v-if="kind === 'ASR_BOUNDARY' && !result && !productionState && !automaticLoading && !error">
      当前草稿尚无自动音频任务。请确认整段音频与完整正文已经保存，再检查自动音频状态。
    </p>
    <template v-if="kind === 'ASR_BOUNDARY' && productionState && !result">
      <ElAlert
        :title="
          productionState.status === 'FAILED'
            ? audioProductionFailureLabel(productionState.error_code)
            : `自动音频任务：${statusLabels[productionState.status] || productionState.status}`
        "
        :type="productionState.status === 'FAILED' ? 'error' : 'info'"
        :closable="false"
      />
      <ContentStageRecoveryPanel
        v-if="productionState.status === 'FAILED' && !dirty"
        :stage-id="productionState.stage_id"
        :expected-edit-version="expectedVersion"
        @retried="restoreLatest"
      />
    </template>
    <template v-if="result">
      <p>
        任务 {{ result.id }} · {{ statusLabels[result.status] || result.status }} · 草稿 v{{
          result.candidate.edit_version
        }}
      </p>
      <ContentStageRecoveryPanel
        v-if="current && result.stage_status === 'FAILED' && result.stage_id"
        :stage-id="result.stage_id"
        :expected-edit-version="expectedVersion"
        @retried="run('refresh')"
      />
      <ElAlert
        v-if="!candidateBelongsToRevision(result, revisionId, origins.get(result.id))"
        title="候选所属草稿与当前草稿不一致或无法核验，当前只供参考，不能采纳"
        type="warning"
        :closable="false"
      />
      <ElAlert
        v-if="!current"
        :title="
          kind === 'ASR_BOUNDARY' && result.stale === true
            ? '当前草稿英文、整段音频或句子边界已变化，原音文候选已陈旧，请保存后重新检查音文对齐'
            : '草稿或音频依赖已变化或尚未核验，请先保存并重新核对候选'
        "
        type="warning"
        :closable="false"
      />
      <template v-if="result.status === 'READY' && kind === 'AI_LEXICON'">
        <ElTable :data="rows" class="candidate-table">
          <ElTableColumn prop="english" label="候选" min-width="180" />
          <ElTableColumn label="类型 / 本篇释义" min-width="240"
            ><template #default="{ row }"
              >{{ row.entryType === 'PHRASE' ? '语块' : '词汇' }} · {{ row.chinese }}</template
            ></ElTableColumn
          >
          <ElTableColumn label="来源" min-width="200"
            ><template #default="{ row }"
              >{{ form.dialogue.findIndex((line) => line.id === row.source_id) + 1 }}句 ·
              {{ row.source_id }}</template
            ></ElTableColumn
          >
          <ElTableColumn label="处理" width="130"
            ><template #default="{ $index }"
              ><ElButton link @click="selectedIndex = $index">编辑 · 核对</ElButton></template
            ></ElTableColumn
          >
        </ElTable>
        <div class="candidate-detail-grid">
          <article v-for="(row, index) in rows" v-show="index === selectedIndex" :key="index">
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
          <aside class="confirmation-scope">
            <h3>确认范围</h3>
            <strong>一次确认 · 按内容复用</strong>
            <p>
              本篇保存确认英文、释义、解释、来源句和版本；同词不同意思独立条目，用户收藏保留当时快照。
            </p>
            <p>候选不会覆盖上传词表；未采用的选填推荐不会阻止主体内容发布。</p>
            <p>当前接口每次采纳一项后结束该候选；其他来源可再次明确请求</p>
          </aside>
        </div>
      </template>
      <template v-if="result.status === 'READY' && asr">
        <ElAlert
          v-if="asr.alignment_status"
          :title="
            asr.alignment_status === 'ALIGNED'
              ? '自动对齐已完成，实际单句文件由服务端生成；完成抽样确认后才可发布'
              : '音文匹配存在异常，请按句子核对原文与实际边界，修正后重生成'
          "
          :type="asr.alignment_status === 'ALIGNED' ? 'success' : 'warning'"
          :closable="false"
        />
        <ElTable v-if="asr.alignment?.length" :data="asr.alignment">
          <ElTableColumn prop="sentence_id" label="句子编号" />
          <ElTableColumn label="原文"
            ><template #default="{ row }">{{
              form.dialogue.find((line) => line.id === row.sentence_id)?.english
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="start_ms" label="开始（毫秒）" />
          <ElTableColumn prop="end_ms" label="结束（毫秒）" />
        </ElTable>
        <ElAlert
          v-for="(issue, index) in asr.issues || []"
          :key="`${issue.sentence_id}:${index}`"
          :title="`${issue.sentence_id || '整段音频'}：${issue.message}`"
          type="warning"
          :closable="false"
        />
        <p class="source">{{ asr.text }}</p>
        <ElTable :data="asr.boundaries"
          ><ElTableColumn type="index" label="参考段" /><ElTableColumn
            prop="start_ms"
            label="开始（毫秒）" /><ElTableColumn prop="end_ms" label="结束（毫秒）"
        /></ElTable>
        <p>
          {{
            asr.alignment_status
              ? '机器对齐与生成文件不等于人工试听；在下方刷新实际切片状态，再进入正常内容抽样。异常项仍需逐句修正与试听。'
              : '当前任务仅包含转录参考，请重新检查自动对齐；参考段不能替代已核验的句子边界。'
          }}
        </p>
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

  .candidate-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    gap: 16px;

    @media (width <= 1000px) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .confirmation-scope {
    padding: 24px;
    border: 1px solid var(--juya-color-border);
    border-radius: 14px;

    h3 {
      margin: 0 0 16px;
      font-size: 18px;
    }

    p {
      line-height: 22px;
    }
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

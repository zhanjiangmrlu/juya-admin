<script setup lang="ts">
import { computed, reactive } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type {
  CandidateDecision,
  CandidateGroup,
  ProductionSchema as S,
  WorkItem,
  WorkItemDetail
} from './work-order-model'

import { productionLabels } from './work-order-model'
const props = defineProps<{
  groups: CandidateGroup[]
  busy: boolean
  items?: WorkItem[]
  details?: WorkItemDetail[]
}>()
const emit = defineEmits<{
  decide: [group: CandidateGroup, decisions: CandidateDecision[]]
  dismiss: [group: CandidateGroup]
  edit: [itemId: string]
}>()
const selected = reactive<Record<string, string[]>>({})
const meanings = reactive<Record<string, 'wording' | 'new_sense' | undefined>>({})
const translations = reactive<Record<string, string>>({})
const positions = reactive<Record<string, number | undefined>>({})
const entryTypes = reactive<Record<string, 'VOCABULARY' | 'PHRASE'>>({})
const senseGroups = computed(() => {
  const rows = new Map<string, { word: string; meaning: string; type: string; members: string[] }>()
  for (const group of props.groups)
    for (const result of group.results) {
      const word = (result.english || result.provided?.english || '').trim().toLocaleLowerCase()
      const meaning = (result.chinese || result.provided?.chinese || '').trim()
      const content = props.details?.find((item) => item.item_id === group.item_id)?.current
      const type =
        content && content.template !== 'short_reading'
          ? content.content.chunks?.some((entry) => entry.entry_id === result.entry_id)
            ? '语块'
            : '词汇'
          : group.kind === 'AI_LEXICON'
            ? entryTypes[result.result_id] === 'PHRASE'
              ? '语块'
              : '词汇'
            : '类型待确认'
      const key = JSON.stringify([word, type, meaning])
      const row = rows.get(key) || { word, meaning, type, members: [] }
      if (!row.members.includes(group.item_id)) row.members.push(group.item_id)
      rows.set(key, row)
    }
  return [...rows.values()]
})
const /** 读取候选所属的真实来源句
   * @param group - 当前篇目候选组
   * @param row - 推荐结果的来源绑定
   * @returns 本篇实际原句
   */ sourceSentence = (group: CandidateGroup, row: S['CandidateResult']): string => {
    const detail = props.details?.find((item) => item.item_id === group.item_id)
    return detail?.current?.template !== 'short_reading'
      ? detail?.current?.content.dialogue?.find((line) => line.id === row.source_id)?.english ||
          row.provided?.source_sentence ||
          ''
      : row.provided?.source_sentence || ''
  }
const /** 列出推荐英文在固定来源句中的精确出现位置
   * @param group - 当前篇目候选组
   * @param row - 待定位的推荐结果
   * @returns 可供管理员明确选择的字符起点
   */ sourcePositions = (group: CandidateGroup, row: S['CandidateResult']): number[] => {
    const text = Array.from(sourceSentence(group, row))
    const word = Array.from(row.english || '')
    if (!word.length) return []
    return text.flatMap((_, index) =>
      text.slice(index, index + word.length).join('') === word.join('') ? [index] : []
    )
  }
const /** 决定当前一条结果，不替换同组其他结果
   * @param group - 当前篇目候选组
   * @param row - 管理员核对的结果
   * @returns 触发本条明确决定
   * @param decision - 保留或采纳或拒绝
   */
  decide = (
    group: CandidateGroup,
    row: S['CandidateResult'],
    decision: CandidateDecision['decision']
  ): void =>
    emit('decide', group, [
      {
        result_id: row.result_id,
        decision,
        ...(decision === 'ADOPTED' && group.kind === 'AI_LEXICON'
          ? {
              entry_type: entryTypes[row.result_id] || 'VOCABULARY',
              ...(positions[row.result_id] === undefined
                ? {}
                : {
                    source_id: row.source_id,
                    start: positions[row.result_id],
                    end: positions[row.result_id]! + Array.from(row.english || '').length
                  })
            }
          : {}),
        ...(translations[row.result_id] === undefined
          ? {}
          : { chinese: translations[row.result_id] })
      }
    ])
const /** 明确选择中央定义和释义变化性质
   * @param group - 当前篇目候选组
   * @param row - 当前本地词条候选
   * @param option - 经核对的中央固定定义
   */
  central = (
    group: CandidateGroup,
    row: S['CandidateResult'],
    option: S['CentralOption']
  ): void => {
    if (option.meaning_differs && !meanings[row.result_id]) return
    emit('decide', group, [
      {
        result_id: row.result_id,
        decision: 'USE_CENTRAL',
        lexicon_entry_id: option.lexicon_entry_id,
        definition_version: option.definition_version,
        meaning_change: meanings[row.result_id]
      }
    ])
  }
const /** 仅处理本组勾选的待决定结果
   * @param group - 当前候选组
   * @returns 触发所选结果的决定
   * @param decision - 明确的批量保留或拒绝动作
   */
  bulk = (group: CandidateGroup, decision: 'KEEP_PROVIDED' | 'REJECTED'): void =>
    emit(
      'decide',
      group,
      group.results
        .filter(
          (row) => row.status === 'PENDING' && selected[group.candidate_id]?.includes(row.result_id)
        )
        .map((row) => ({ result_id: row.result_id, decision }))
    )
</script>
<template>
  <div class="candidate-groups">
    <ElAlert
      title="逐条核对本篇释义与原文位置。上传释义保持原值；采用不同释义时，请明确选择改措辞还是新含义。"
      type="info"
      :closable="false"
    />
    <ElEmpty v-if="!groups.length" description="当前没有需要决定的词条候选" />
    <AdminPanel v-if="senseGroups.length" title="按英文、类型与当前含义归组">
      <article
        v-for="sense in senseGroups"
        :key="JSON.stringify([sense.word, sense.type, sense.meaning])"
        class="candidate-row"
      >
        <strong>{{ sense.word }} · {{ sense.type }} · {{ sense.meaning }}</strong>
        <p>受影响 {{ sense.members.length }} 篇；逐篇对照下方来源，决定仅作用于明确选择的结果</p>
        <ElButton
          v-for="member in sense.members"
          :key="member"
          link
          @click="emit('edit', member)"
          >{{
            details?.find((row) => row.item_id === member)?.title_en ||
            items?.find((row) => row.item_id === member)?.title_en ||
            '查看本篇原文'
          }}</ElButton
        >
      </article>
    </AdminPanel>
    <AdminPanel
      v-for="group in groups"
      :key="group.candidate_id"
      :title="`${details?.find((item) => item.item_id === group.item_id)?.title_en || items?.find((item) => item.item_id === group.item_id)?.title_en || '本篇词条'} · ${group.kind === 'AI_LEXICON' ? '可选推荐' : '提供词表与中央定义'}`"
    >
      <div class="group-heading">
        <span
          >{{ productionLabels[group.status] || '正在处理'
          }}<b v-if="group.dismissed"> · 已放弃本次推荐</b
          ><b v-else-if="group.stale"> · 内容已变化，请重新整理</b></span
        ><ElButton link @click="emit('edit', group.item_id)">查看本篇原文</ElButton
        ><ElButton
          v-if="group.kind === 'AI_LEXICON' && !group.dismissed"
          :disabled="busy"
          @click="emit('dismiss', group)"
          >放弃本次推荐</ElButton
        >
      </div>
      <p v-if="group.dismissed">
        {{ group.dismissal_reason || '管理员已放弃本次可选推荐' }}。调用状态和实际用量仍保留。
      </p>
      <ElCheckboxGroup v-model="selected[group.candidate_id]">
        <article v-for="row in group.results" :key="row.result_id" class="candidate-row">
          <div class="word-heading">
            <ElCheckbox
              v-if="row.status === 'PENDING' && !group.stale && !group.dismissed"
              :value="row.result_id"
              :label="row.english || row.provided?.english || '待核对词条'"
            /><strong v-else>{{ row.english || row.provided?.english }}</strong
            ><span>{{ productionLabels[row.status] }}</span>
          </div>
          <p>本篇释义：{{ row.chinese || row.provided?.chinese || '待填写' }}</p>
          <p v-if="row.provided?.source_sentence" class="source-sentence">
            来源句：{{ row.provided.source_sentence }}
          </p>
          <small v-if="row.start !== null && row.start !== undefined"
            >原文位置：第 {{ row.start + 1 }} 至 {{ row.end }} 字符</small
          >
          <template v-if="row.status === 'PENDING' && !group.stale && !group.dismissed">
            <ElInput
              v-if="group.kind === 'AI_LEXICON'"
              v-model="translations[row.result_id]"
              :placeholder="row.chinese || '核对或修正中文释义'"
              aria-label="推荐中文释义"
            />
            <template v-if="group.kind === 'AI_LEXICON'">
              <p class="source-sentence">
                来源句：{{ sourceSentence(group, row) || '来源需核对' }}
              </p>
              <ElSelect
                v-model="entryTypes[row.result_id]"
                placeholder="词汇（默认）"
                aria-label="推荐条目类型"
                ><ElOption value="VOCABULARY" label="词汇" /><ElOption value="PHRASE" label="语块"
              /></ElSelect>
              <template v-if="row.requires_manual_correction"
                ><p>请在实际来源句中选择本次英文出现的位置</p>
                <ElSelect
                  v-model="positions[row.result_id]"
                  aria-label="原文位置"
                  placeholder="选择原文中的对应位置"
                  ><ElOption
                    v-for="start in sourcePositions(group, row)"
                    :key="start"
                    :value="start"
                    :label="`第 ${start + 1} 个字符起 · ${row.english}`"
                /></ElSelect>
                <p v-if="!sourcePositions(group, row).length">
                  当前来源句中没有准确对应，请修正本篇正文后重新整理。
                </p></template
              >
            </template>
            <div class="row-actions">
              <ElButton
                v-if="group.kind === 'PROVIDED_LEXICON'"
                :disabled="busy"
                @click="decide(group, row, 'KEEP_PROVIDED')"
                >保留上传释义</ElButton
              ><ElButton
                v-else
                :disabled="
                  busy || (row.requires_manual_correction && positions[row.result_id] === undefined)
                "
                @click="decide(group, row, 'ADOPTED')"
                >采纳本条</ElButton
              ><ElButton :disabled="busy" @click="decide(group, row, 'REJECTED')"
                >拒绝本条</ElButton
              >
              <ElButton
                v-if="group.kind === 'PROVIDED_LEXICON'"
                :disabled="busy"
                @click="
                  emit('decide', group, [
                    {
                      result_id: row.result_id,
                      decision: 'KEEP_PROVIDED',
                      central_action: 'new_sense'
                    }
                  ])
                "
                >将本篇释义新增为中央义项</ElButton
              >
            </div>
            <div
              v-for="option in row.central_options"
              :key="`${option.lexicon_entry_id}:${option.definition_version}`"
              class="central-option"
            >
              <strong>中央定义：{{ option.content.chinese }}</strong>
              <p>{{ option.content.explanation }}</p>
              <p>使用中央定义只更新本篇明确选择的词条引用，其他篇目与历史版本保留原引用</p>
              <ElButton
                v-if="group.kind === 'PROVIDED_LEXICON'"
                :disabled="busy"
                @click="
                  emit('decide', group, [
                    {
                      result_id: row.result_id,
                      decision: 'KEEP_PROVIDED',
                      central_action: 'wording',
                      lexicon_entry_id: option.lexicon_entry_id,
                      definition_version: option.definition_version
                    }
                  ])
                "
                >以本篇释义修订此中央措辞</ElButton
              >
              <ElRadioGroup v-if="option.meaning_differs" v-model="meanings[row.result_id]"
                ><ElRadio value="wording">修改同一含义的措辞</ElRadio
                ><ElRadio value="new_sense">使用新的含义</ElRadio></ElRadioGroup
              ><ElButton
                :disabled="busy || (option.meaning_differs && !meanings[row.result_id])"
                @click="central(group, row, option)"
                >使用此中央定义</ElButton
              >
            </div>
          </template>
        </article>
      </ElCheckboxGroup>
      <div v-if="!group.stale && !group.dismissed" class="row-actions">
        <ElButton
          v-if="group.kind === 'PROVIDED_LEXICON'"
          :disabled="busy || !selected[group.candidate_id]?.length"
          @click="bulk(group, 'KEEP_PROVIDED')"
          >保留本组所选上传释义</ElButton
        ><ElButton
          :disabled="busy || !selected[group.candidate_id]?.length"
          @click="bulk(group, 'REJECTED')"
          >拒绝本组所选结果</ElButton
        >
      </div>
    </AdminPanel>
  </div>
</template>
<style scoped lang="scss">
.candidate-groups {
  display: grid;
  gap: 20px;

  .group-heading,
  .word-heading,
  .row-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .candidate-row {
    padding: 20px 0;
    border-bottom: 1px solid var(--juya-color-border);
    color: var(--juya-color-text-primary);

    p {
      line-height: 1.7;
    }
  }

  .source-sentence,
  small {
    color: var(--juya-color-text-regular);
  }

  .central-option {
    margin-top: 16px;
    padding: 16px;
    border-radius: 12px;
    background: var(--juya-color-primary-soft);
  }

  .row-actions {
    margin-top: 16px;
  }
}
</style>

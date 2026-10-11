<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import PronunciationStatusPanel from '@/features/audio/pronunciation-status-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { DialogueRow, LexiconRow } from './scene-form'

import LexiconMediaFields from './lexicon-media-fields.vue'
import { createLexiconRow } from './scene-form'

const rows = defineModel<LexiconRow[]>({ required: true })
const props = defineProps<{
  entryType: 'vocabulary' | 'chunk'
  sentences: DialogueRow[]
  compact?: boolean
  candidate?: boolean
  modern?: boolean
  originalImageAssetId?: string | null
}>()
const adapter = createContentAdapter(useAdminApiClient())
const query = ref('')
const results = ref<LexiconRow[]>([])
const busy = ref(false)
const emit = defineEmits<{ busy: [value: boolean]; confirm: [index: number] }>()
const rowKeys = new WeakMap<LexiconRow, number>()
let nextRowKey = 0
const mediaRows = ref(new Set<LexiconRow>())
watch(
  computed(() => mediaRows.value.size > 0),
  (value) => emit('busy', value)
)
/** 保持词库登记前后相同的编辑行身份。
 * @param row - 编辑中的条目
 * @returns 稳定界面编号
 */
function rowKey(row: LexiconRow): number {
  if (!rowKeys.has(row)) rowKeys.set(row, ++nextRowKey)
  return rowKeys.get(row)!
}
/** 保护正在执行的素材操作。
 * @param row - 编辑中的条目
 * @param value - 是否处理中
 */
function setMediaBusy(row: LexiconRow, value: boolean): void {
  if (value) mediaRows.value.add(row)
  else mediaRows.value.delete(row)
}
/** 查询全局词库。 */
async function search(): Promise<void> {
  busy.value = true
  try {
    results.value = await adapter.listLexicon(query.value, props.entryType)
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '词库查询失败')
  } finally {
    busy.value = false
  }
}
/** 将固定版本词条加入草稿。
 * @param entry - 词库版本
 */
function add(entry: LexiconRow): void {
  rows.value.push(globalThis.structuredClone(entry))
}
/** 保存全局词条新版本并更新本行引用。
 * @param index - 行序号
 */
async function saveEntry(index: number): Promise<void> {
  const entry = rows.value[index]
  if (!entry || !entry.english.trim() || mediaRows.value.has(entry)) return
  setMediaBusy(entry, true)
  try {
    Object.assign(entry, await adapter.saveLexicon(entry, props.entryType))
    ElMessage.success('词库版本已保存，保存草稿后生效')
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '词条保存失败')
  } finally {
    setMediaBusy(entry, false)
  }
}
</script>
<template>
  <div class="lexicon-fields">
    <div v-if="!candidate && !modern" class="search-bar">
      <ElInput v-model="query" aria-label="查询全局词库" placeholder="查询已有英文词条" /><ElButton
        :loading="busy"
        @click="search"
        >查询词库</ElButton
      >
    </div>
    <div v-if="results.length" class="search-results">
      <ElButton
        v-for="entry in results"
        :key="`${entry.entry_id}:${entry.entry_version}`"
        @click="add(entry)"
        >{{ entry.english }} · v{{ entry.entry_version }}</ElButton
      >
    </div>
    <ElEmpty
      v-if="!rows.length"
      :description="entryType === 'chunk' ? '添加常用语块' : '添加核心词汇'"
    />
    <div v-for="(row, index) in rows" :key="rowKey(row)" class="entry-row">
      <div class="row-heading">
        <strong>{{ entryType === 'chunk' ? '语块' : '词汇' }} {{ index + 1 }}</strong
        ><small
          >{{ row.entry_id || (modern ? '保存草稿时登记本篇词条' : '保存草稿时自动登记词库') }} ·
          v{{ row.entry_version }}</small
        ><ElButton link type="danger" :disabled="mediaRows.has(row)" @click="rows.splice(index, 1)"
          >删除条目</ElButton
        >
      </div>
      <div v-if="compact" class="entry-summary">
        <h3>
          {{ row.english }} <span>{{ row.phonetic }}</span>
        </h3>
        <p>当前释义：{{ row.chinese || '待填写' }}</p>
        <p class="muted">解释：{{ row.explanation || '未填写' }}</p>
        <p class="muted">
          来源句：{{
            row.source_sentence ||
            sentences.find((sentence) => row.source_sentence_ids.includes(sentence.id))?.english ||
            '待定位'
          }}
        </p>
        <ElTag v-if="row.confirmed" type="success" effect="plain">本篇义项已确认</ElTag>
        <p v-if="entryType === 'chunk'" class="muted">
          语块不配置图片，用户端使用纯文字列表；音标仅在适用且已确认时保存。
        </p>
      </div>
      <details :open="!compact" class="entry-details">
        <summary v-if="compact">编辑文字资料</summary>
        <ElForm label-position="top" class="entry-form" :disabled="mediaRows.has(row)">
          <ElFormItem label="英文"
            ><ElInput v-model="row.english" :aria-label="`${entryType} 英文 ${index + 1}`"
          /></ElFormItem>
          <ElFormItem label="音标"
            ><ElInput v-model="row.phonetic" :aria-label="`${entryType} 音标 ${index + 1}`"
          /></ElFormItem>
          <ElFormItem label="中文"
            ><ElInput v-model="row.chinese" :aria-label="`${entryType} 中文 ${index + 1}`"
          /></ElFormItem>
          <ElFormItem label="英文变体"
            ><ElSelect
              v-model="row.variants"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="输入后回车添加"
              ><ElOption
                v-for="variant in row.variants"
                :key="variant"
                :label="variant"
                :value="variant" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="用法解释" class="full-width"
            ><ElInput v-model="row.explanation" type="textarea" :rows="2"
          /></ElFormItem>
          <ElFormItem label="来源句子" class="full-width"
            ><ElSelect v-model="row.source_sentence_ids" multiple placeholder="选择所在句子"
              ><ElOption
                v-for="(sentence, sentenceIndex) in sentences"
                :key="sentence.id"
                :label="`${sentenceIndex + 1}. ${sentence.english || '空白句子'}`"
                :value="sentence.id" /></ElSelect
          ></ElFormItem>
          <ElFormItem v-if="entryType === 'vocabulary'" label="单词图片素材编号（可空）"
            ><ElInput v-model="row.icon_asset_id" clearable
          /></ElFormItem>
          <ElFormItem label="本篇来源原句" class="full-width">
            <ElInput
              v-model="row.source_sentence"
              type="textarea"
              :rows="2"
              placeholder="保留这篇内容中使用本义项的原句"
            />
          </ElFormItem>
          <ElFormItem label="发音文字">
            <ElInput v-model="row.pronunciation_text" :placeholder="row.english" />
          </ElFormItem>
          <ElFormItem label="允许准备独立发音">
            <ElSwitch v-model="row.allow_synthesis" />
          </ElFormItem>
          <ElFormItem label="读音变体（可空）"
            ><ElInput v-model="row.reading_variant" placeholder="例如不同读法的区分说明"
          /></ElFormItem>
          <ElFormItem label="释义变化类型"
            ><ElSelect v-model="row.meaning_change" clearable
              ><ElOption label="原义项文字修正" value="wording" /><ElOption
                label="新义项（保留原义项）"
                value="new_sense" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="本篇词义人工确认"
            ><ElTag v-if="row.confirmed" type="success">服务端已确认本篇义项</ElTag
            ><ElButton
              v-else
              :disabled="mediaRows.has(row) || candidate"
              @click="emit('confirm', index)"
              >保存并确认这篇义项与来源</ElButton
            ></ElFormItem
          >
          <ElFormItem v-if="!modern" label="独立发音目标编号（可空）"
            ><ElInput v-model="row.audio_target_id" clearable
          /></ElFormItem>
          <ElFormItem v-if="!modern" label="独立发音版本编号（可空）"
            ><ElInput v-model="row.audio_version_id" clearable
          /></ElFormItem>
        </ElForm>
      </details>
      <p v-if="modern">
        固定发音目标：{{
          row.pronunciation_target_id || '服务端准备后返回'
        }}；人工音频可通过独立素材包明确绑定
      </p>
      <PronunciationStatusPanel
        v-if="modern && row.pronunciation_target_id"
        :target-id="row.pronunciation_target_id"
        :disabled="candidate || mediaRows.has(row)"
      />
      <LexiconMediaFields
        v-if="!candidate"
        :entry="row"
        :entry-type="entryType"
        :modern="modern"
        :original-image-asset-id="originalImageAssetId"
        @update="Object.assign(row, $event)"
        @busy="setMediaBusy(row, $event)"
      /><ElButton
        v-if="!candidate && !modern"
        :disabled="!row.english.trim() || mediaRows.has(row)"
        @click="saveEntry(index)"
        >保存到全局词库</ElButton
      >
    </div>
    <ElButton @click="rows.push(createLexiconRow())">{{
      entryType === 'chunk' ? '添加语块' : '添加词汇'
    }}</ElButton>
  </div>
</template>
<style scoped lang="scss">
.entry-summary {
  h3 {
    margin: 12px 0;
    font-size: 18px;
    line-height: 27px;
  }

  span {
    font-weight: 500;
  }

  p {
    margin: 10px 0;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }
}

.entry-details {
  summary {
    width: fit-content;
    padding: 10px 24px;
    border: 1px solid var(--juya-color-border);
    border-radius: 12px;
    color: var(--el-color-primary);
    cursor: pointer;
  }

  &[open] summary {
    margin-bottom: 16px;
  }
}

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.search-results {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.entry-row {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--juya-color-surface);
}

.row-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

small {
  flex: 1;
  color: var(--juya-color-text-secondary);
  overflow-wrap: anywhere;
}

.entry-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.full-width {
  grid-column: 1 / -1;
}
</style>

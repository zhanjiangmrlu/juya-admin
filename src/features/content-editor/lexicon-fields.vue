<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ref } from 'vue'

import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { DialogueRow, LexiconRow } from './scene-form'

import { createLexiconRow } from './scene-form'

const rows = defineModel<LexiconRow[]>({ required: true })
const props = defineProps<{
  entryType: 'vocabulary' | 'chunk'
  sentences: DialogueRow[]
  candidate?: boolean
}>()
const adapter = createContentAdapter(useAdminApiClient())
const query = ref('')
const results = ref<LexiconRow[]>([])
const busy = ref(false)
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
  if (!entry || !entry.english.trim()) return
  try {
    rows.value[index] = await adapter.saveLexicon(entry, props.entryType)
    ElMessage.success('词库版本已保存，保存草稿后生效')
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '词条保存失败')
  }
}
</script>
<template>
  <div class="lexicon-fields">
    <div v-if="!candidate" class="search-bar">
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
    <div v-for="(row, index) in rows" :key="`${index}:${row.entry_id}`" class="entry-row">
      <div class="row-heading">
        <strong>{{ entryType === 'chunk' ? '语块' : '词汇' }} {{ index + 1 }}</strong
        ><small>{{ row.entry_id || '保存草稿时自动登记词库' }} · v{{ row.entry_version }}</small
        ><ElButton link type="danger" @click="rows.splice(index, 1)">删除条目</ElButton>
      </div>
      <ElForm label-position="top" class="entry-form">
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
        <ElFormItem label="图标素材编号"
          ><ElInput v-model="row.icon_asset_id" clearable
        /></ElFormItem>
        <ElFormItem label="独立发音目标编号（可空）"
          ><ElInput v-model="row.audio_target_id" clearable
        /></ElFormItem>
        <ElFormItem label="独立发音版本编号（可空）"
          ><ElInput v-model="row.audio_version_id" clearable
        /></ElFormItem>
      </ElForm>
      <ElButton v-if="!candidate" :disabled="!row.english.trim()" @click="saveEntry(index)"
        >保存到全局词库</ElButton
      >
    </div>
    <ElButton @click="rows.push(createLexiconRow())">{{
      entryType === 'chunk' ? '添加语块' : '添加词汇'
    }}</ElButton>
  </div>
</template>
<style scoped lang="scss">
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
  border-radius: 8px;
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

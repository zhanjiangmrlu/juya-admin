<script setup lang="ts">
import { computed } from 'vue'

import type { ArticlePayload, Topic } from './listening-types'

const props = defineProps<{
  before: { topic_id: string | null; payload: Partial<ArticlePayload> } | null
  after: { topic_id: string | null; payload: Partial<ArticlePayload> }
  topics: Topic[]
}>()
const labels = {
  title_zh: '中文标题',
  title_en: '英文标题',
  tags: '内容标签',
  body_en: '英文正文',
  translation_zh: '全文中文译文',
  expressions: '表达与例句',
  word_meanings: '本篇词义位置',
  audio_id: '完整音频素材',
  image_id: '选填配图素材'
} as const
/** 展示真实差异值，数组和词义位置完整保留供核对
 * @param value 当前草稿或本次候选的字段值
 * @param field 当前业务字段，用于按资料含义组织可读文字
 * @returns 可阅读的原值
 */
const display = (value: unknown, field: keyof typeof labels) => {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  )
    return '未设置'
  if (field === 'tags') return (value as ArticlePayload['tags']).join('、')
  if (field === 'expressions')
    return (value as ArticlePayload['expressions'])
      .map(
        (item, index) =>
          `${index + 1}. ${item.english}\n中文释义：${item.chinese}\n替换例句：${item.example}`
      )
      .join('\n\n')
  if (field === 'word_meanings')
    return (value as ArticlePayload['word_meanings'])
      .map(
        (item, index) =>
          `${index + 1}. ${item.word}\n中文释义：${item.chinese}\n原形：${item.lemma || '未设置'}\n音标：${item.phonetic || '未设置'}\n正文位置：${item.start}—${item.end}`
      )
      .join('\n\n')
  return String(value)
}
/** 将真实主题编号对应到已读取名称，未匹配时保留编号供核对
 * @param id 草稿或候选的主题编号
 * @returns 当前可识别的主题
 */
const topic = (id: string | null | undefined) =>
  props.topics.find((item) => item.id === id)?.name || id || '未设置'
const differences = computed(() => {
  const rows: { field: string; label: string; before: string; after: string }[] = Object.entries(
    labels
  ).flatMap(([field, label]) => {
    const key = field as keyof typeof labels,
      before = props.before?.payload[key],
      after = props.after.payload[key]
    return !props.before || JSON.stringify(before) !== JSON.stringify(after)
      ? [
          {
            field,
            label,
            before: props.before ? display(before, key) : '尚未创建',
            after: display(after, key)
          }
        ]
      : []
  })
  if (!props.before || props.before.topic_id !== props.after.topic_id)
    rows.unshift({
      field: 'topic_id',
      label: '所属主题',
      before: props.before ? topic(props.before.topic_id) : '尚未创建',
      after: topic(props.after.topic_id)
    })
  return rows
})
</script>
<template>
  <div class="import-difference">
    <p v-if="!differences.length" class="notice">本次资料与目标当前草稿相同</p>
    <table v-else>
      <thead>
        <tr>
          <th>字段</th>
          <th>当前目标草稿</th>
          <th>本次导入草稿</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in differences" :key="row.field">
          <th>{{ row.label }}</th>
          <td>
            <pre :class="{ grouped: ['expressions', 'word_meanings'].includes(row.field) }">{{
              row.before
            }}</pre>
          </td>
          <td>
            <pre :class="{ grouped: ['expressions', 'word_meanings'].includes(row.field) }">{{
              row.after
            }}</pre>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="muted small">
      这里只核对草稿变化；最终确认保存后仍需单独预览、明确发布，才会更新学习端
    </p>
  </div>
</template>
<style scoped lang="scss">
.import-difference {
  table {
    width: 100%;
    table-layout: fixed;
  }

  th:first-child {
    width: 120px;
  }

  td,
  th {
    vertical-align: top;
  }

  pre {
    max-height: 280px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;

    &.grouped {
      max-height: 480px;
    }
  }
}
</style>

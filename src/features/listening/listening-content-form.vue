<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ArticlePayload, Category, Topic } from './listening-types'

import { topicLabel } from './listening-model'

const payload = defineModel<ArticlePayload>({ required: true })
const topic = defineModel<string>('topic', { required: true })
const props = defineProps<{
  topics: Topic[]
  categories?: Category[]
  disabled?: boolean
  compact?: boolean
}>()
const category = ref('')
const visibleTopics = computed(() =>
  props.topics.filter((item) => !category.value || item.category_id === category.value)
)
watch(
  () => [topic.value, props.topics] as const,
  () => {
    if (topic.value)
      category.value = props.topics.find((item) => item.id === topic.value)?.category_id || ''
  },
  { immediate: true }
)
/** 切换分类后清除不属于该分类的主题，避免错误归属 */
const changeCategory = () => {
  if (!visibleTopics.value.some((item) => item.id === topic.value)) topic.value = ''
}
const meanings = ref(''),
  meaningError = ref('')
const tags = computed({
  get: () => payload.value.tags.join('，'),
  set: (value: string) => {
    payload.value.tags = value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
})
watch(
  () => payload.value.word_meanings,
  (value) => {
    meanings.value = JSON.stringify(value, null, 2)
  },
  { immediate: true }
)
/** 校验本篇已确认词义的原文码点位置，不自动猜配 */
const applyMeanings = () => {
  try {
    const value: unknown = JSON.parse(meanings.value)
    if (
      !Array.isArray(value) ||
      value.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          !Number.isInteger(item.start) ||
          !Number.isInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          typeof item.word !== 'string' ||
          typeof item.chinese !== 'string' ||
          [...payload.value.body_en].slice(item.start, item.end).join('') !== item.word
      )
    )
      throw new Error('请使用JSON数组，并核对每项start/end码点位置、原词word及中文chinese')
    payload.value.word_meanings = value
    meaningError.value = ''
  } catch (reason) {
    meaningError.value = reason instanceof Error ? reason.message : '词义格式无效'
  }
}
/** 添加待管理员补充的表达，最终发布要求恰好5组 */
const addExpression = () => {
  payload.value.expressions.push({ english: '', chinese: '', example: '' })
}
defineExpose({ meaningError })
</script>
<template>
  <fieldset class="content-form" :class="{ compact }" :disabled="disabled">
    <section class="panel content-card">
      <h2>文章资料</h2>
      <div class="form-columns">
        <label class="field"
          >中文标题 *<input v-model="payload.title_zh" placeholder="请输入中文标题"
        /></label>
        <label class="field"
          >英文标题 *<input v-model="payload.title_en" placeholder="Enter an English title"
        /></label>
        <label v-if="categories?.length" class="field"
          >分类 *<select v-model="category" aria-label="所属分类" @change="changeCategory">
            <option value="">请选择已有分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select></label
        >
        <label class="field"
          >所属主题 *<select v-model="topic" aria-label="所属主题">
            <option value="">请选择主题</option>
            <option v-for="item in visibleTopics" :key="item.id" :value="item.id">
              {{ topicLabel(item) }}
            </option>
          </select></label
        >
      </div>
      <label class="field"
        >内容标签（选填）<input v-model="tags" placeholder="多个标签以逗号分隔"
      /></label>
    </section>
    <div class="body-columns">
      <section class="panel content-card">
        <div class="between">
          <h2>英文正文 *</h2>
          <small class="muted">保留自然段，词数由服务端计算</small>
        </div>
        <label class="field"
          ><span class="sr-only">英文正文</span
          ><textarea v-model="payload.body_en" rows="8" placeholder="粘贴或输入英文正文" />
        </label>
      </section>
      <section class="panel content-card">
        <div class="between">
          <h2>全文中文译文 *</h2>
          <small class="muted">对应全文内容</small>
        </div>
        <label class="field"
          ><span class="sr-only">全文中文译文</span
          ><textarea
            v-model="payload.translation_zh"
            rows="6"
            placeholder="粘贴或输入已准备好的中文译文"
          />
        </label>
      </section>
    </div>
    <section class="panel content-card">
      <div class="between">
        <h2>5组语块与替换例句 *</h2>
        <button type="button" @click="addExpression">添加表达</button>
      </div>
      <p class="muted small">每组包括英文语块、中文释义和一条替换例句</p>
      <div class="table-wrap">
        <table class="expressions-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>英文表达</th>
              <th>中文释义</th>
              <th>替换例句</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in payload.expressions" :key="index">
              <td>{{ index + 1 }}</td>
              <td><input v-model="item.english" :aria-label="`表达${index + 1}英文`" /></td>
              <td><input v-model="item.chinese" :aria-label="`表达${index + 1}中文`" /></td>
              <td>
                <textarea v-model="item.example" rows="2" :aria-label="`表达${index + 1}例句`" />
              </td>
              <td>
                <button
                  type="button"
                  class="text danger"
                  @click="payload.expressions.splice(index, 1)"
                >
                  移除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <slot name="media" />
    <section class="panel content-card">
      <h2>本篇词义 <small class="muted">选填</small></h2>
      <p class="muted small">录入与本篇正文位置对应的已确认释义；正文修改后需重新核对</p>
      <details>
        <summary>已确认本篇词义（{{ payload.word_meanings.length }}项）</summary>
        <p class="muted small">start/end为英文原文Unicode码点偏移</p>
        <label class="field"
          >词义资料JSON<textarea v-model="meanings" rows="7" @change="applyMeanings" />
        </label>
        <p v-if="meaningError" class="notice error" role="alert">{{ meaningError }}</p>
      </details>
    </section>
  </fieldset>
</template>
<style scoped lang="scss">
.content-form {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;

  .content-card {
    padding: 22px;
    margin-bottom: 20px;

    h2 {
      font-size: 17px;
      margin-bottom: 16px;
    }

    .field:where(:last-child) {
      margin-bottom: 0;
    }

    > p {
      margin-bottom: 16px;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .form-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }

  .expressions-table {
    table-layout: fixed;

    th {
      font-size: 12px;
    }

    th:where(:first-child) {
      width: 50px;
    }

    th:where(:last-child) {
      width: 60px;
    }

    th:where(:nth-child(4)) {
      width: 36%;
    }

    td {
      padding: 10px 6px;
    }

    input,
    textarea {
      width: 100%;
      min-width: 0;
    }
  }

  details {
    margin-top: 16px;

    summary {
      cursor: pointer;
    }
  }

  &.compact {
    .body-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }
  }

  @media (width <= 900px) {
    .form-columns {
      grid-template-columns: 1fr;
    }

    &.compact .body-columns {
      grid-template-columns: 1fr;
    }
  }
}
</style>

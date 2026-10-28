<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ArticlePayload, Topic } from './listening-types'

const payload = defineModel<ArticlePayload>({ required: true })
const topic = defineModel<string>('topic', { required: true })
defineProps<{ topics: Topic[]; disabled?: boolean }>()
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
  <fieldset class="content-form" :disabled="disabled">
    <label class="field"
      >所属主题<select v-model="topic">
        <option value="">请选择主题</option>
        <option v-for="item in topics" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select></label
    >
    <div class="form-columns">
      <label class="field">中文标题<input v-model="payload.title_zh" /></label>
      <label class="field">英文标题<input v-model="payload.title_en" /></label>
    </div>
    <label class="field"
      >内容标签<input v-model="tags" placeholder="多个标签以逗号分隔，选填"
    /></label>
    <label class="field"
      >英文正文<textarea v-model="payload.body_en" rows="10" /><small
        >保留自然段；词数由服务端统一计算</small
      ></label
    >
    <label class="field">全文中文译文<textarea v-model="payload.translation_zh" rows="7" /></label>
    <div class="between">
      <h3>5组表达</h3>
      <button type="button" @click="addExpression">添加表达</button>
    </div>
    <div v-for="(item, index) in payload.expressions" :key="index" class="expression">
      <div class="between">
        <strong>表达 {{ index + 1 }}</strong
        ><button type="button" class="text danger" @click="payload.expressions.splice(index, 1)">
          移除
        </button>
      </div>
      <label class="field">英文表达<input v-model="item.english" /></label>
      <label class="field">中文释义<input v-model="item.chinese" /></label>
      <label class="field">替换例句<textarea v-model="item.example" rows="2" /></label>
    </div>
    <details>
      <summary>已确认本篇词义（选填）</summary>
      <p class="muted small">start/end为英文原文Unicode码点偏移；正文修改后需重新核对</p>
      <label class="field"
        >词义资料JSON<textarea v-model="meanings" rows="7" @change="applyMeanings" />
      </label>
      <p v-if="meaningError" class="notice error" role="alert">{{ meaningError }}</p>
    </details>
  </fieldset>
</template>
<style scoped lang="scss">
.content-form {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;

  .form-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .expression {
    border-top: 1px solid var(--line);
    margin-top: 18px;
    padding: 18px 0;
  }

  details {
    margin-top: 20px;

    summary {
      cursor: pointer;
    }
  }
}
</style>

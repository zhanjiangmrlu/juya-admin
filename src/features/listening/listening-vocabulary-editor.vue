<script setup lang="ts">
import { ElButton, ElCheckbox, ElInput, ElOption, ElSelect } from 'element-plus'
import { computed, watch } from 'vue'

import confirmedIcon from '@/assets/icons/vocabulary-confirmed.svg'
import {
  type ListeningPronunciationContext,
  useListeningPronunciation
} from '@/composables/use-listening-pronunciation'

import {
  sentenceOptions,
  vocabularyErrors,
  type VocabularyWord,
  wordOptions
} from './listening-vocabulary-model'
const words = defineModel<VocabularyWord[]>({ required: true })
const props = defineProps<{
  body: string
  disabled?: boolean
  pronunciation?: ListeningPronunciationContext
}>()
const sentences = computed(() => sentenceOptions(props.body))
const speech = useListeningPronunciation(() => props.pronunciation)
/** 添加独立词义条目，不按英文拼写覆盖已有资料 */
const add = () => {
  words.value = [
    ...words.value,
    {
      id: crypto.randomUUID(),
      english: '',
      meaning: '',
      phonetic: '',
      source_hint: '',
      source: null
    }
  ]
}
/** 移动当前词条并保留稳定编号
 * @param index 当前词条位置
 * @param step 上移为-1，下移为1
 */
const move = (index: number, step: number) => {
  const result = [...words.value],
    target = index + step
  if (target < 0 || target >= result.length) return
  ;[result[index], result[target]] = [result[target]!, result[index]!]
  words.value = result
}
/** 删除管理员明确选择的词条
 * @param index 当前词条位置
 */
const remove = (index: number) => {
  speech.stop()
  words.value = words.value.filter((_, i) => i !== index)
}
/** 选择当前正文中明确的一处原句，词形需重新确认
 * @param item 正在编辑的独立词条
 * @param start 原句在当前正文中的码点位置
 */
const selectSentence = (item: VocabularyWord, start: number) => {
  const source = sentences.value.find((sentence) => sentence.start === start)
  item.source = source
    ? { ...source, word_start: source.start, word_end: source.start, word: '', confirmed: false }
    : null
}
/** 固定该句中的实际词形位置，不自动猜测词义
 * @param item 正在编辑的独立词条
 * @param start 管理员选中词形的正文绝对位置
 */
const selectWord = (item: VocabularyWord, start: number) => {
  if (!item.source) return
  const word = wordOptions(props.body, item.source).find((word) => word.word_start === start)
  if (word) item.source = { ...item.source, ...word, confirmed: false }
}
watch(
  () => [props.body, props.pronunciation],
  () => speech.stop()
)
</script>
<template>
  <section class="vocabulary-editor">
    <div class="between">
      <h2>
        重点词汇 <small class="muted">选填 · {{ words.length }}项</small>
      </h2>
      <ElButton data-testid="add-vocabulary" :disabled="disabled" @click="add">添加词汇</ElButton>
    </div>
    <p class="muted small">
      同词不同义分别保存；原句须来自当前正文。单词发音由受控服务生成，不上传逐词音频。
    </p>
    <p v-if="!words.length" class="muted small">没有词汇仍可发布，阅读预览隐藏整个词汇区</p>
    <article v-for="(item, index) in words" :key="item.id" class="vocabulary-card">
      <div class="between">
        <strong>{{ item.english || '待填词汇' }} · {{ item.meaning || '待填释义' }}</strong>
        <div class="row">
          <ElButton
            link
            :disabled="
              disabled ||
              !pronunciation ||
              (speech.current.value === item.id && speech.status.value === 'loading')
            "
            @click="speech.play(item.id)"
            >{{
              speech.current.value === item.id && speech.status.value === 'loading'
                ? '加载中…'
                : '试听单词'
            }}</ElButton
          >
          <ElButton
            link
            data-testid="vocabulary-up"
            :disabled="disabled || index === 0"
            @click="move(index, -1)"
            >上移</ElButton
          ><ElButton link :disabled="disabled || index === words.length - 1" @click="move(index, 1)"
            >下移</ElButton
          ><ElButton
            link
            type="danger"
            data-testid="vocabulary-remove"
            :disabled="disabled"
            @click="remove(index)"
            >删除</ElButton
          >
        </div>
      </div>
      <div class="word-grid">
        <label class="field"
          >词汇 *<ElInput
            v-model="item.english"
            :aria-label="`词汇${index + 1}英文`"
            :disabled="disabled"
            @input="item.source && (item.source.confirmed = false)"
        /></label>
        <label class="field"
          >音标（选填）<ElInput v-model="item.phonetic" :disabled="disabled"
        /></label>
        <label class="field"
          >本句释义 *<ElInput
            v-model="item.meaning"
            :aria-label="`词汇${index + 1}释义`"
            :disabled="disabled"
        /></label>
      </div>
      <p v-if="!item.source && item.source_hint" class="notice">
        文档原句待核对：{{ item.source_hint }}
      </p>
      <label class="field"
        >对应英文原句 *<ElSelect
          :model-value="item.source?.start"
          :aria-label="`词汇${index + 1}原句`"
          :disabled="disabled"
          placeholder="从当前英文正文选择原句"
          @change="selectSentence(item, $event)"
          ><ElOption
            v-for="sentence in sentences"
            :key="sentence.start"
            :value="sentence.start"
            :label="`${sentence.quote}（位置${sentence.start}）`" /></ElSelect
      ></label>
      <div v-if="item.source" class="source-grid">
        <label class="field"
          >正文实际词形 *<ElSelect
            :model-value="
              item.source.word_end > item.source.word_start ? item.source.word_start : undefined
            "
            :aria-label="`词汇${index + 1}词形`"
            :disabled="disabled"
            placeholder="选择该句中对应的词"
            @change="selectWord(item, $event)"
            ><ElOption
              v-for="word in wordOptions(body, item.source)"
              :key="word.word_start"
              :value="word.word_start"
              :label="`${word.word}（位置${word.word_start}）`" /></ElSelect></label
        ><ElCheckbox v-model="item.source.confirmed" :disabled="disabled || !item.source.word"
          >确认采用本句及词形对应（{{ item.english }} →
          {{ item.source.word || '待选择' }}）</ElCheckbox
        >
      </div>
      <p v-if="vocabularyErrors(body, [item]).length" class="notice error" role="alert">
        {{
          vocabularyErrors(body, [item])
            .map((message) => message.replace('词汇1：', ''))
            .join('；')
        }}
      </p>
      <p v-else class="source-confirmed">
        <img :src="confirmedIcon" width="15" height="15" alt="" />来源已匹配 · 不同义项独立保存
      </p>
      <p
        v-if="speech.current.value === item.id && speech.error.value"
        class="notice error"
        role="alert"
      >
        {{ speech.error.value }}
      </p>
    </article>
    <p v-if="words.length && !pronunciation" class="muted small">保存当前修改后可试听已保存词汇</p>
  </section>
</template>
<style scoped lang="scss">
.vocabulary-editor {
  > p {
    margin: 16px 0;
  }

  .vocabulary-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 20px;
    margin-top: 16px;
  }

  .word-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1.3fr;
    gap: 16px;
    margin-top: 18px;
  }

  .source-grid {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
  }

  .source-confirmed {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--green);
    font-size: 12px;

    img {
      flex-shrink: 0;
    }
  }

  .el-select {
    width: 100%;
  }

  @media (width <= 900px) {
    .word-grid {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .between {
      flex-wrap: wrap;
      gap: 12px;
    }
  }
}
</style>

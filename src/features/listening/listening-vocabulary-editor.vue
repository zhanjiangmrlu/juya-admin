<script setup lang="ts">
import { ElButton, ElInput, ElOption, ElSelect } from 'element-plus'
import { computed, watch } from 'vue'

import confirmedIcon from '@/assets/icons/vocabulary-confirmed.svg'
import {
  type ListeningPronunciationContext,
  useListeningPronunciation
} from '@/composables/use-listening-pronunciation'

import {
  resolveVocabularySource,
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
/** 手动调整原句时自动匹配该句中的词形
 * @param item 正在编辑的独立词条
 * @param start 原句在当前正文中的码点位置
 */
const selectSentence = (item: VocabularyWord, start: number) => {
  const source = sentences.value.find((sentence) => sentence.start === start)
  item.source_hint = source?.quote || ''
  item.source = source
    ? { ...source, word_start: source.start, word_end: source.start, word: '', confirmed: false }
    : null
  item.source = resolveVocabularySource(props.body, item) || item.source
}
/** 保存管理员调整后的真实词形位置
 * @param item 正在编辑的独立词条
 * @param start 管理员选中词形的正文绝对位置
 */
const selectWord = (item: VocabularyWord, start: number) => {
  if (!item.source) return
  const word = wordOptions(props.body, item.source).find((word) => word.word_start === start)
  if (word) item.source = { ...item.source, ...word, confirmed: true }
}
/** 按当前正文更新词汇来源，无法匹配时保留文档原句供修正 */
const matchSources = () => {
  const next = words.value.map((item) => {
    const matched = resolveVocabularySource(props.body, item)
    // 手动指定原句后保留待选词形状态，未知变形也可以从真实正文中调整
    const pending =
      item.source &&
      !item.source.word &&
      sentences.value.some(
        (sentence) =>
          sentence.start === item.source!.start &&
          sentence.end === item.source!.end &&
          sentence.quote === item.source!.quote
      )
    const source = matched || (pending ? item.source : null)
    return {
      ...item,
      source,
      source_hint: item.source_hint || (!source ? item.source?.quote : '') || ''
    }
  })
  if (JSON.stringify(next) !== JSON.stringify(words.value)) words.value = next
}
watch(() => [props.body, words.value], matchSources, { immediate: true, deep: true })
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
          ><span class="field-label">词汇 *</span
          ><ElInput
            v-model="item.english"
            :aria-label="`词汇${index + 1}英文`"
            :disabled="disabled"
            @input="item.source = null"
        /></label>
        <label class="field"
          ><span class="field-label">音标（选填）</span
          ><ElInput v-model="item.phonetic" :disabled="disabled"
        /></label>
        <label class="field"
          ><span class="field-label">本句释义 *</span
          ><ElInput
            v-model="item.meaning"
            :aria-label="`词汇${index + 1}释义`"
            :disabled="disabled"
        /></label>
      </div>
      <p v-if="!item.source && item.source_hint" class="notice">文档原句：{{ item.source_hint }}</p>
      <label class="field"
        ><span class="field-label">对应英文原句 *</span
        ><ElSelect
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
          ><span class="field-label">正文实际词形 *</span
          ><ElSelect
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
              :label="`${word.word}（位置${word.word_start}）`" /></ElSelect
        ></label>
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
    min-width: 0;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 20px;
    margin-top: 16px;

    > .between {
      flex-wrap: wrap;
      gap: 12px;

      > :where(strong) {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      > :where(.row) {
        flex-wrap: wrap;
      }
    }
  }

  .word-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 16px;
    margin-top: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 7px;

    > .el-input,
    > .el-select {
      width: 100%;
      min-width: 0;
      margin-top: 0;
    }
  }

  .field-label {
    display: block;
  }

  .source-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 20px;
    align-items: center;
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
    .word-grid,
    .source-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .between {
      flex-wrap: wrap;
      gap: 12px;
    }
  }
}
</style>

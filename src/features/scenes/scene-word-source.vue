<script setup lang="ts">
import { computed, ref } from 'vue'

import type { components } from '@/shared/contracts/generated/admin-api'

import { findSources, type SceneContent } from './editor-model'
const props = defineProps<{
  dialogue: SceneContent['dialogue']
  word: components['schemas']['Vocabulary']
}>()
const emit = defineEmits<{ select: [source: components['schemas']['Source']] }>()
const manual = ref(false),
  selected = ref<components['schemas']['Source'] | null>(null)
const candidates = computed(() => findSources(props.dialogue, props.word.english))
const actual = computed(() => {
  const source = props.word.source
  return (
    source &&
    props.dialogue.some(
      (line) =>
        line.id === source.line_id && line.english.slice(source.start, source.end) === source.quote
    )
  )
})
/** 从管理员实际选中的原句片段建立绑定
 * @param event 原句选择事件
 * @param line 被选择的对话
 */
const selection = (event: Event, line: SceneContent['dialogue'][number]) => {
  const input = event.target as HTMLTextAreaElement,
    start = input.selectionStart,
    end = input.selectionEnd
  selected.value =
    end > start ? { line_id: line.id!, start, end, quote: line.english.slice(start, end) } : null
}
</script>
<template>
  <div class="word-source">
    <template v-if="actual"
      ><p class="source-ok">
        已关联原句 · <mark>{{ word.source?.quote }}</mark>
      </p></template
    ><template v-else-if="candidates.length === 1"
      ><p class="source-ok">
        唯一对应位置 · <mark>{{ candidates[0]?.quote }}</mark>
      </p>
      <p class="source-sentence">{{ candidates[0]?.sentence }}</p></template
    ><template v-else
      ><p class="muted small">
        {{
          candidates.length
            ? '找到多处位置，请选择本条词汇对应的原句'
            : '未找到对应位置，请修改词汇，或手动选择原句片段'
        }}
      </p>
      <button
        v-for="(candidate, index) in candidates"
        :key="index"
        type="button"
        class="source-choice"
        @click="
          emit('select', {
            line_id: candidate.line_id,
            start: candidate.start,
            end: candidate.end,
            quote: candidate.quote
          })
        "
      >
        {{ candidate.sentence.slice(0, candidate.start) }}<mark>{{ candidate.quote }}</mark
        >{{ candidate.sentence.slice(candidate.end) }}
      </button></template
    ><button
      type="button"
      class="text small"
      @click="
        () => {
          manual = true
          selected = null
        }
      "
    >
      {{ actual ? '重新选择来源' : '在原句中选择片段' }}</button
    ><ElDialog v-model="manual" title="选择原句片段" width="620px" append-to-body
      ><p class="muted">
        选中原句中对应词汇的实际片段，再确认。可绑定词形变化，如 buy 对应 bought。
      </p>
      <label v-for="line in dialogue" :key="line.id" class="field"
        ><span>{{ line.speaker }}</span
        ><textarea :value="line.english" readonly @select="selection($event, line)" />
      </label>
      <p v-if="selected" class="notice">已选择：{{ selected.quote }}</p>
      <template #footer
        ><button type="button" @click="manual = false">取消</button>
        <button
          type="button"
          class="primary"
          :disabled="!selected"
          @click="
            () => {
              selected && emit('select', selected)
              manual = false
            }
          "
        >
          确认片段
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.word-source {
  padding: 14px;
  background: var(--soft);
  border-radius: 8px;
  margin-top: 12px;

  .source-ok {
    font-size: 12px;
    color: var(--green);
  }

  .source-sentence {
    font-size: 12px;
    margin: 6px 0;
  }

  .source-choice {
    display: block;
    text-align: left;
    font-size: 12px;
    width: 100%;
    margin-top: 8px;
    white-space: pre-wrap;
  }

  mark {
    background: #dae8cf;
    color: var(--green);
    font-weight: 600;
  }
}
</style>

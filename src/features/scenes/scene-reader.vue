<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import AppIcon from '@/components/app-icon/app-icon.vue'
import { useWordPronunciation } from '@/composables/use-word-pronunciation'
import { claimAudioFocus } from '@/services/audio-focus'
import { mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { loadPronunciation } from '@/services/pronunciation-service'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { SceneReaderProps } from '@/shared/types/scene-components'
const props = defineProps<SceneReaderProps>()
const speech = useWordPronunciation(async (wordId, active) => {
  if (!props.pronunciation) throw new Error('请先保存资料后试听')
  audio.value?.pause()
  const context = props.pronunciation,
    { reference } = context
  const prefix = context.import
    ? `/api/admin/v1/imports/${encodeURIComponent(context.import.batchId)}/items/${encodeURIComponent(context.import.itemId)}`
    : `/api/admin/v1/cards/${encodeURIComponent(context.cardId)}`
  const path = `${prefix}/words/${encodeURIComponent(wordId)}/pronunciation`
  const url = await loadPronunciation(
    {
      active,
      pause: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      request: (method, path, reference) =>
        api.request<components['schemas']['SpeechState']>(
          method === 'GET' ? queryURL(path, reference) : path,
          method === 'POST' ? { method, body: reference } : {}
        )
    },
    path,
    reference
  )
  if (!url.startsWith('/api/admin/v1/')) throw new Error('发音地址暂不可用')
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + url
})
/** 完整音频主动播放时终止词汇试听 */
const fullPlay = () => {
  speech.stop()
  if (audio.value) claimAudioFocus(audio.value)
}

const translated = ref(false),
  audio = ref<HTMLAudioElement | null>(null),
  imageError = ref(false),
  imageExpanded = ref(false)
/** 只展示已确认的高亮，不通过 HTML 插值解释正文
 * @param line 当前对话
 * @returns 按原顺序排列的文字片段
 */
const segments = (line: components['schemas']['Dialogue']) => {
  const sources = (props.content.vocabulary || [])
    .map((word) => word.source)
    .filter(
      (source) =>
        source &&
        source.line_id === line.id &&
        line.english.slice(source.start, source.end) === source.quote
    )
    .sort((a, b) => a!.start - b!.start)
  const result: { text: string; highlight: boolean }[] = []
  let cursor = 0
  for (const source of sources) {
    if (!source || source.start < cursor) continue
    result.push(
      { text: line.english.slice(cursor, source.start), highlight: false },
      { text: line.english.slice(source.start, source.end), highlight: true }
    )
    cursor = source.end
  }
  result.push({ text: line.english.slice(cursor), highlight: false })
  return result
}
onBeforeUnmount(() => audio.value?.pause())
</script>
<template>
  <article class="scene-reader">
    <header class="scene-heading">
      <h1>{{ content.name }}</h1>
      <button type="button" class="small" disabled>收藏（预览）</button>
    </header>
    <figure v-if="content.image_id">
      <button type="button" class="picture" aria-label="查看场景大图" @click="imageExpanded = true">
        <img
          v-if="!imageError"
          :src="mediaURL(content.image_id)"
          :alt="content.name"
          @error="imageError = true"
        /><span v-else>图片暂不可用，点击查看大图</span>
      </button>
    </figure>
    <section v-if="content.audio_id" class="audio">
      <h2><AppIcon name="play" :size="18" />完整音频</h2>
      <audio
        ref="audio"
        :src="mediaURL(content.audio_id)"
        controls
        preload="none"
        @play="fullPlay"
      />
    </section>
    <section>
      <h2>场景对话</h2>
      <div v-for="line in content.dialogue" :key="line.id" class="dialogue">
        <small>{{ line.speaker }}</small>
        <p class="english">
          <template v-for="(part, index) in segments(line)" :key="index"
            ><mark v-if="part.highlight">{{ part.text }}</mark
            ><template v-else>{{ part.text }}</template></template
          >
        </p>
      </div>
      <button
        type="button"
        data-action="translation"
        class="text small"
        @click="translated = !translated"
      >
        {{ translated ? '收起译文' : '显示译文' }}
      </button>
      <div v-if="translated" class="translation-section">
        <h3>完整译文</h3>
        <div v-for="line in content.dialogue" :key="line.id" class="translation-line">
          <small>{{ line.speaker }}</small>
          <p class="translation">{{ line.chinese }}</p>
        </div>
      </div>
    </section>
    <section>
      <h2>重点词汇 <small>本句释义</small></h2>
      <div v-for="word in content.vocabulary" :key="word.id" class="word">
        <button
          type="button"
          class="word-trigger"
          :data-word="word.id"
          :disabled="
            !pronunciation ||
            !word.id ||
            (speech.current.value === word.id && speech.status.value === 'loading')
          "
          @click="word.id && speech.play(word.id)"
        >
          <strong>{{ word.english }}</strong
          ><span class="voice-label">{{
            speech.current.value === word.id && speech.status.value === 'loading'
              ? '加载中…'
              : speech.current.value === word.id && speech.status.value === 'playing'
                ? '播放中'
                : '试听'
          }}</span>
        </button>
        <span v-if="word.phonetic" class="phonetic">{{ word.phonetic }}</span>
        <p>{{ word.meaning }}</p>
        <p v-if="word.source" class="source">
          {{ content.dialogue?.find((line) => line.id === word.source?.line_id)?.english }}
        </p>
        <button
          v-if="speech.current.value === word.id && speech.error.value"
          type="button"
          class="text small voice-error"
          @click="word.id && speech.play(word.id)"
        >
          {{ speech.error.value }}
        </button>
      </div>
    </section>
    <section v-if="content.chunks?.length">
      <h2>语块</h2>
      <div v-for="chunk in content.chunks" :key="chunk.id" class="word">
        <strong>{{ chunk.english }}</strong>
        <p>{{ chunk.chinese }}</p>
      </div>
    </section>
    <button type="button" class="preview-completion" disabled>已完成学习（预览）</button>
    <div class="preview-note">只读预览 · 不计学习或打卡</div>
    <ElDialog v-model="imageExpanded" title="场景大图" width="min(90vw, 1000px)" append-to-body
      ><img :src="mediaURL(content.image_id)" :alt="content.name" class="full-image"
    /></ElDialog>
  </article>
</template>
<style scoped lang="scss">
.scene-reader {
  width: 375px;
  max-width: 100%;
  margin: auto;
  background: var(--paper);
  padding: 24px;
  color: var(--ink);
  font-size: 14px;
  overflow-wrap: anywhere;

  .scene-heading {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .preview-completion {
    width: 100%;
    margin-top: 28px;
  }

  h1 {
    font-size: 22px;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  h2 {
    font-size: 18px;
    margin: 0 0 14px;

    small {
      font-size: 11px;
      color: var(--muted);
      font-weight: 400;
    }
  }

  figure {
    margin: 0;

    .picture {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      border-radius: 8px;
      overflow: hidden;

      img {
        display: block;
        width: 100%;
        height: auto;
      }
    }
  }

  section {
    margin-top: 28px;
  }

  .audio {
    padding: 16px;
    background: var(--soft);
    border-radius: 10px;

    h2 {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
    }

    audio {
      width: 100%;
      height: 38px;
    }
  }

  .dialogue {
    padding: 0 0 20px;

    small {
      color: var(--muted);
      font-size: 11px;
    }

    .english {
      font-size: 16px;
      line-height: 1.85;
    }

    mark {
      background: #e3edda;
      color: var(--green);
      border-radius: 3px;
      padding: 1px 0;
    }
  }

  .translation-section {
    margin-top: 14px;
    padding: 16px;
    background: var(--soft);
    border-radius: 8px;

    h3 {
      font-size: 13px;
      margin: 0 0 14px;
    }

    small {
      font-size: 11px;
      color: var(--muted);
    }
  }

  .translation-line + .translation-line {
    margin-top: 14px;
  }

  .translation {
    font-size: 13px;
    color: var(--muted);
    margin-top: 6px;
    line-height: 1.9;
  }

  .word-trigger {
    padding: 0;
    border: 0;
    background: none;
    display: flex;
    gap: 14px;
    color: var(--ink);
    text-align: left;
  }

  .voice-label {
    font-size: 11px;
    color: var(--green);
  }

  .voice-error {
    font-size: 11px;
    color: var(--danger);
  }

  .source {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.8;
    white-space: pre-wrap;
  }

  .word {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);

    strong {
      font-size: 17px;
    }

    p {
      margin-top: 5px;
      font-size: 13px;
    }

    .phonetic {
      color: var(--muted);
      font-size: 12px;
      display: block;
      margin: 3px 0;
    }
  }

  .preview-note {
    margin: 32px 0 8px;
    color: var(--muted);
    font-size: 11px;
    text-align: center;
  }
}

.full-image {
  display: block;
  width: 100%;
  height: auto;
}
</style>

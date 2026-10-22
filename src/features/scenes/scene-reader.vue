<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from '@/components/app-icon/app-icon.vue'
import { useWordPronunciation } from '@/composables/use-word-pronunciation'
import { mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { loadPronunciation } from '@/services/pronunciation-service'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { SceneReaderProps } from '@/shared/types/scene-components'

import SceneAudio from './scene-audio.vue'
import SceneTitle from './scene-title.vue'
const props = defineProps<SceneReaderProps>()
const emit = defineEmits<{ close: [] }>()
const speech = useWordPronunciation(async (wordId, active) => {
  if (!props.pronunciation) throw new Error('请先保存资料后试听')
  audio.value?.stop()
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
}

const translated = ref(false),
  audio = ref<InstanceType<typeof SceneAudio> | null>(null),
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
watch(
  () => props.content.audio_id,
  () => {
    audio.value?.stop()
    speech.stop()
  }
)
onBeforeUnmount(() => audio.value?.stop())
</script>
<template>
  <article class="scene-reader" :class="{ phone }">
    <div v-if="phone" class="reader-nav">
      <button type="button" aria-label="返回预览前页面" @click="emit('close')">
        <AppIcon name="back" :size="22" /></button
      ><span>场景预览</span
      ><span class="miniapp-capsule" aria-hidden="true">••• <span>◉</span></span>
    </div>
    <header class="scene-heading">
      <h1>
        <SceneTitle :name="content.name" :title-en="content.title_en" :show-missing="false" />
      </h1>
      <button type="button" class="favorite-preview" disabled>
        <AppIcon name="heart" :size="19" />收藏（预览）
      </button>
    </header>
    <figure v-if="content.image_id">
      <button type="button" class="picture" aria-label="查看场景大图" @click="imageExpanded = true">
        <img
          v-if="!imageError"
          :src="mediaURL(content.image_id)"
          :alt="content.name"
          @error="imageError = true"
        /><span v-else>图片暂不可用</span>
        <span class="picture-copy"
          ><strong>Start with the scene.</strong><span>点击场景卡，查看完整图片。</span
          ><span class="button-link">放大场景卡</span></span
        >
      </button>
    </figure>
    <section v-if="content.audio_id" class="audio">
      <SceneAudio ref="audio" :media-id="content.audio_id" variant="preview" @play="fullPlay" />
    </section>
    <section>
      <h2 class="reading-heading"><span>The conversation</span><small>场景对话</small></h2>
      <div v-for="line in content.dialogue" :key="line.id" class="dialogue">
        <small>{{ line.speaker }}</small>
        <p class="english">
          <template v-for="(part, index) in segments(line)" :key="index"
            ><mark v-if="part.highlight">{{ part.text }}</mark
            ><template v-else>{{ part.text }}</template></template
          >
        </p>
      </div>
      <div class="lookup-preview">
        <button type="button" data-action="lookup-preview" class="text small" disabled>
          中央查词（预览）
        </button>
        <p>中央查词仅作禁用示例；词汇释义与发音请在下方核对。</p>
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
      <h2 class="reading-heading">
        <span>Words in context</span><small>重点词汇 · 本句释义</small>
      </h2>
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
          ><AppIcon name="speaker" :size="15" /><span class="voice-label">{{
            speech.current.value === word.id && speech.status.value === 'loading'
              ? '加载中…'
              : speech.current.value === word.id && speech.status.value === 'playing'
                ? '播放中'
                : '试听'
          }}</span>
        </button>
        <span v-if="word.phonetic" class="phonetic">{{ word.phonetic }}</span>
        <p v-if="word.meaning" class="meaning">{{ word.meaning }}</p>
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
      <h2 class="reading-heading"><span>Useful expressions</span><small>语块</small></h2>
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
:where(.scene-reader) {
  width: 390px;
  max-width: 100%;
  margin: auto;
  background: var(--bg);
  padding: 20px;
  color: var(--ink);
  font-size: 16px;
  line-height: 1.8;
  overflow-wrap: anywhere;

  .lookup-preview {
    margin: 12px 0;

    button {
      min-height: 44px;
    }

    p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
  }

  .reader-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 32px;
    height: 36px;
    font-size: 16px;
    font-weight: 500;

    button {
      padding: 0;
      border: 0;
      background: none;
      min-height: 36px;
    }

    .miniapp-capsule {
      margin-left: auto;
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 0 12px;
      height: 29px;
      font-size: 13px;

      span {
        margin-left: 12px;
        padding-left: 12px;
        border-left: 1px solid var(--line);
      }
    }
  }

  .scene-heading {
    position: relative;
    margin-bottom: 28px;

    h1 {
      font-size: 22px;
      line-height: 1.5;
      font-weight: 500;
      width: 100%;
    }
  }

  :deep(.scene-title) {
    .chinese {
      padding-right: 100px;
      font-weight: 600;
    }

    .english {
      font-family: Fraunces, serif;
      font-size: 22px;
      color: var(--ink);
      line-height: 1.5;
      margin-top: 14px;
    }
  }

  .favorite-preview {
    position: absolute;
    top: 0;
    right: 0;
    min-height: 32px;
    padding: 0;
    font-size: 12px;
    border: 0;
    background: none;
    color: #78867a;
    opacity: 1;
  }

  figure {
    margin: 0;
  }

  .picture {
    display: flex;
    align-items: center;
    gap: 18px;
    width: 100%;
    padding: 16px;
    min-height: 174px;
    text-align: left;
    border-radius: 16px;

    img {
      display: block;
      width: 92px;
      height: 140px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .picture-copy {
      display: grid;
      gap: 8px;
      min-width: 0;

      strong {
        font-family: Fraunces, serif;
        font-size: 23px;
        font-weight: 400;
        line-height: 1.4;
      }

      > span:not(:where(.button-link)) {
        font-size: 12px;
        color: var(--muted);
      }

      .button-link {
        justify-self: start;
        font-size: 13px;
        min-height: 40px;
        font-weight: 400;
      }
    }
  }

  section {
    margin-top: 36px;
  }

  .reading-heading {
    margin: 0 0 24px;

    span {
      display: block;
      font-family: Fraunces, serif;
      font-size: 27px;
      font-weight: 400;
      line-height: 1.35;
    }

    small {
      display: block;
      font-size: 13px;
      font-weight: 400;
      color: var(--muted);
      margin-top: 5px;
    }
  }

  .dialogue {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding-bottom: 20px;

    small {
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      width: 25px;
      height: 25px;
      background: var(--soft);
      font-size: 12px;
    }

    .english {
      font-size: 17px;
      line-height: 1.9;
    }

    mark {
      background: #ddefd8;
      color: var(--ink);
      font-weight: 700;
      border-radius: 4px;
      padding: 1px 2px;
    }
  }

  .translation-section {
    margin-top: 16px;
    padding: 18px;
    border-radius: 12px;
    background: #f1f5e9;

    h3 {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 16px;
    }

    .translation-line {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      font-size: 14px;

      small {
        color: var(--muted);
      }
    }
  }

  .word {
    margin-top: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--line);

    .word-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      min-height: 30px;
      font-size: 20px;
      text-align: left;

      strong {
        font-weight: 500;
      }
    }

    > strong,
    .phonetic {
      font-size: 20px;
    }

    .phonetic {
      margin-left: 10px;
    }

    .meaning,
    > p {
      font-size: 16px;
      margin-top: 8px;
    }

    .source {
      color: var(--muted);
    }

    .voice-label {
      font-size: 11px;
      color: var(--muted);
    }

    .voice-error {
      color: var(--red);
    }
  }

  .preview-completion {
    width: 100%;
    margin-top: 28px;
    min-height: 46px;
    background: transparent;
    color: #78867a;
    opacity: 1;
  }

  .preview-note {
    font-size: 12px;
    text-align: center;
    color: var(--muted);
    padding-top: 10px;
  }
}

.full-image {
  display: block;
  max-width: 100%;
  max-height: 78vh;
  object-fit: contain;
  margin: auto;
}
</style>

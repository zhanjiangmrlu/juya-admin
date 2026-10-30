<script setup lang="ts">
import { computed, ref } from 'vue'

import imageZoom from '@/assets/icons/image-zoom.svg'
import SceneAudio from '@/features/scenes/scene-audio.vue'
import { listeningMediaURL } from '@/services/listening-service'

import type { Article } from './listening-types'

import { timelineCharacters } from './listening-model'

const props = defineProps<{
  article: Pick<Article, 'id' | 'payload' | 'timeline'> & { word_count?: number }
  mediaBase?: string
}>()
/** 为正式文章或批次暂存预览选择受控媒体
 * @param id 当前选用的素材编号
 * @returns 管理员受控地址
 */
const mediaSource = (id: string | null) =>
  props.mediaBase && id
    ? `${props.mediaBase}/${encodeURIComponent(id)}`
    : listeningMediaURL(props.article.id, id)
const position = ref(0),
  translation = ref(false),
  image = ref(false),
  imageFailure = ref(false)
const paragraphs = computed(() => {
  const words = props.article.timeline?.state === 'ready' ? props.article.timeline.words : []
  const chars = timelineCharacters(
    props.article.payload.body_en,
    words || [],
    position.value,
    props.article.payload.expressions.map((item) => item.english)
  )
  const result: (typeof chars)[] = [[]]
  for (const char of chars) {
    if (char.text === '\n') result.push([])
    else result.at(-1)!.push(char)
  }
  return result
})
</script>
<template>
  <article class="listening-reader">
    <div class="reader-heading">
      <div class="heading-copy">
        <h2>{{ article.payload.title_zh || '中文标题待补充' }}</h2>
        <p class="english-title">{{ article.payload.title_en || '英文标题待补充' }}</p>
      </div>
      <button
        v-if="article.payload.image_id"
        type="button"
        class="image-entry text"
        @click="image = true"
      >
        <img :src="mediaSource(article.payload.image_id)" alt="文章配图" /><span
          ><img
            class="zoom-icon"
            :src="imageZoom"
            width="11"
            height="11"
            alt=""
            aria-hidden="true"
          />查看大图</span
        >
      </button>
    </div>
    <p class="muted small">
      {{ article.payload.tags.join(' · ') }}{{ article.payload.tags.length ? ' · ' : ''
      }}{{
        article.word_count === undefined ? '词数保存后由服务端计算' : `${article.word_count} 词`
      }}
      · {{ article.payload.expressions.length }}个表达
    </p>
    <div v-if="article.payload.audio_id" class="player">
      <SceneAudio
        :media-id="article.payload.audio_id"
        :source-url="mediaSource(article.payload.audio_id)"
        variant="preview"
        inline-rates
        title="完整英文音频"
        subtitle="LISTEN TO THE FULL ARTICLE"
        @position="position = $event"
      />
      <p v-if="article.timeline?.state !== 'ready'" class="muted small">
        逐字时间轴暂不可用，仍可阅读和播放完整音频
      </p>
    </div>
    <div class="prose">
      <p v-for="(paragraph, index) in paragraphs" :key="index">
        <span
          v-for="(char, offset) in paragraph"
          :key="offset"
          :class="{ active: char.active, trail: char.trail }"
          :style="{
            background: char.active ? '#dcecc9' : char.background,
            color: char.active
              ? '#1e6b43'
              : char.trail
                ? `rgba(30,107,67,${0.45 + char.opacity * 0.55})`
                : undefined
          }"
          >{{ char.text }}</span
        >
      </p>
    </div>
    <button type="button" @click="translation = !translation">
      {{ translation ? '收起中文译文' : '展开中文译文' }}
    </button>
    <div v-if="translation" class="prose">
      <p v-for="(text, index) in article.payload.translation_zh.split('\n')" :key="index">
        {{ text }}
      </p>
    </div>
    <h3>表达积累</h3>
    <div v-for="(item, index) in article.payload.expressions" :key="index" class="expression">
      <strong>{{ item.english }}</strong>
      <p>{{ item.chinese }}</p>
      <p>{{ item.example }}</p>
    </div>
    <ElDialog v-model="image" title="文章原图" width="90%" append-to-body
      ><p class="muted small">原图按比例展示，可在浏览器中缩放查看</p>
      <img
        v-if="!imageFailure"
        class="full-image"
        :src="mediaSource(article.payload.image_id)"
        alt="文章原图"
        @error="imageFailure = true"
      />
      <p v-else role="alert">
        配图读取失败<button @click="imageFailure = false">重试</button>
      </p></ElDialog
    >
  </article>
</template>
<style scoped lang="scss">
.listening-reader {
  max-width: 760px;
  margin: auto;

  .reader-heading {
    display: flex;
    gap: 16px;
    align-items: start;
    margin-top: 20px;
  }

  .heading-copy {
    flex: 1;
    min-width: 0;

    h2 {
      font-size: 18px;
      line-height: 1.6;
    }
  }

  .english-title {
    font-size: 30px;
    line-height: 1.25;
    font-family: Fraunces, Georgia, serif;
    margin: 10px 0;
  }

  .image-entry {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
    padding: 0;
    font-size: 10px;
    width: 70px;

    span {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    > img {
      width: 64px;
      height: 96px;
      border-radius: 7px;
      object-fit: contain;
    }
  }

  .player {
    margin: 24px 0;

    > p {
      margin-top: 12px;
    }
  }

  .prose {
    font-size: 16px;
    line-height: 1.85;
    margin: 24px 0;

    p {
      text-indent: 2em;
      white-space: pre-wrap;
      margin-bottom: 16px;
    }

    .active {
      background: var(--action);
      color: var(--green);
    }

    .trail {
      background: rgb(200 226 181 / var(--trail));
    }
  }

  h3 {
    margin-top: 30px;
  }

  .expression {
    border-top: 1px solid var(--line);
    padding: 16px 0;
  }
}

.full-image {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  margin: auto;
}
</style>

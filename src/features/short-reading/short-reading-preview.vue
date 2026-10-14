<script setup lang="ts">
import { ref } from 'vue'

import AppAudioPlayer from '@/components/app-audio-player/app-audio-player.vue'

import type { ShortReadingContent } from './short-reading-model'

defineProps<{
  content: ShortReadingContent
  coverUrl?: string
  audioUrl?: string
  devicePreview?: boolean
}>()
const device = ref('phone')
</script>
<template>
  <div class="reading-preview-workspace">
    <ElRadioGroup v-if="devicePreview" v-model="device" aria-label="短文预览设备">
      <ElRadioButton value="phone">手机预览</ElRadioButton>
      <ElRadioButton value="tablet">平板预览</ElRadioButton>
    </ElRadioGroup>
    <article class="short-reading-preview" :class="devicePreview ? device : ''">
      <img v-if="coverUrl" :src="coverUrl" alt="短文安全封面" />
      <small>{{
        [content.category, content.topic, content.level].filter(Boolean).join(' · ')
      }}</small>
      <h2>{{ content.title_en }}</h2>
      <h3>{{ content.title_zh }}</h3>
      <p class="intro">{{ content.safe_intro }}</p>
      <AppAudioPlayer v-if="audioUrl" :src="audioUrl" />
      <div class="paragraphs">
        <p v-for="(paragraph, index) in content.paragraphs_en" :key="index" lang="en">
          {{ paragraph }}
        </p>
      </div>
      <ElCollapse
        ><ElCollapseItem title="查看全文中文翻译"
          ><p class="translation">{{ content.translation_zh }}</p></ElCollapseItem
        ></ElCollapse
      >
    </article>
  </div>
</template>
<style scoped lang="scss">
.short-reading-preview {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 16px;
  background: var(--juya-color-surface);

  &.phone {
    width: min(390px, 100%);
  }

  &.tablet {
    width: min(720px, 100%);
  }

  img {
    width: 100%;
    max-height: 240px;
    object-fit: contain;
  }

  h2 {
    line-height: 1.5;
  }

  h3,
  small,
  .intro {
    color: var(--juya-color-text-secondary);
  }

  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.9;
  }

  .paragraphs {
    margin: 24px 0;
    font-size: 17px;
  }

  audio {
    width: 100%;
  }
}

.reading-preview-workspace {
  display: grid;
  gap: 18px;
  min-width: 0;
}

@media (width <= 600px) {
  .short-reading-preview {
    padding: 14px;
  }
}
</style>

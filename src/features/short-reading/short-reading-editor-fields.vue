<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppAudioPlayer from '@/components/app-audio-player/app-audio-player.vue'

import type { ShortReadingContent } from './short-reading-model'
import type { UploadFile } from 'element-plus'

const form = defineModel<ShortReadingContent>({ required: true })
defineProps<{
  disabled: boolean
  busy: boolean
  coverUrl: string
  audioUrl: string
  audioDisabled: boolean
}>()
const emit = defineEmits<{
  cover: [file: UploadFile]
  audio: [file: UploadFile]
  refresh: []
  removeAudio: []
}>()
const /**
   * 保留未修改段落的稳定编号，新段落交由服务端分配
   * @param text - 管理员编辑的完整英文段落
   */ updateParagraphs = (text: string): void => {
    const next = text.split(/\n\s*\n/)
    const used = new Set<number>()
    const ids = next.map((paragraph) => {
      const index = form.value.paragraphs_en.findIndex(
        (previous, position) => previous === paragraph && !used.has(position)
      )
      if (index < 0) return globalThis.crypto.randomUUID()
      used.add(index)
      return form.value.paragraph_ids[index] || globalThis.crypto.randomUUID()
    })
    form.value.paragraphs_en = next
    form.value.paragraph_ids = ids
  }
const paragraphs = computed({
  get: () => form.value.paragraphs_en.join('\n\n'),
  set: updateParagraphs
})
const audioPlayed = ref(false)
watch(
  () => form.value.audio?.version_id,
  () => {
    audioPlayed.value = false
  }
)
const /**
   * 写入管理员对实际固定音频的试听确认
   * @param checked - 管理员主动勾选的确认状态
   */ confirmAudio = (checked: boolean): void => {
    if (!form.value.audio) return
    form.value.audio.listening_confirmed = checked
    form.value.audio.confirmed_asset_id = checked ? form.value.audio.asset_id : null
    form.value.audio.confirmed_version_id = checked ? form.value.audio.version_id : null
  }
const metadata: readonly [
  keyof Pick<
    ShortReadingContent,
    'title_en' | 'title_zh' | 'category' | 'topic' | 'level' | 'safe_intro' | 'copyright_source'
  >,
  string
][] = [
  ['title_en', '英文标题'],
  ['title_zh', '中文标题'],
  ['category', '类别'],
  ['topic', '题材'],
  ['level', '难度'],
  ['safe_intro', '安全简介'],
  ['copyright_source', '来源与版权说明']
]
</script>
<template>
  <div class="short-reading-fields">
    <AdminPanel title="短文元信息与选填封面">
      <ElForm label-position="top" class="metadata" :disabled="disabled || busy"
        ><ElFormItem v-for="[key, label] in metadata" :key="key" :label="label" required
          ><ElInput
            v-model="form[key]"
            :type="['safe_intro', 'copyright_source'].includes(key) ? 'textarea' : 'text'"
            :aria-label="label" /></ElFormItem
        ><ElFormItem label="版权核验"
          ><ElCheckbox
            :model-value="form.copyright_status === 'CONFIRMED'"
            @update:model-value="form.copyright_status = $event ? 'CONFIRMED' : 'PENDING'"
            >已人工核验来源与使用授权</ElCheckbox
          ></ElFormItem
        ></ElForm
      >
      <div class="cover">
        <img v-if="coverUrl" :src="coverUrl" alt="当前安全封面" /><ElUpload
          :auto-upload="false"
          :show-file-list="false"
          accept="image/jpeg,image/png,image/webp"
          :disabled="disabled || busy"
          @change="emit('cover', $event)"
          ><ElButton :disabled="disabled || busy">上传或替换封面（选填）</ElButton></ElUpload
        ><ElButton
          v-if="form.cover_asset_id"
          :disabled="disabled || busy"
          @click="form.cover_asset_id = null"
          >移除封面</ElButton
        >
      </div>
    </AdminPanel>
    <div class="reading-grid">
      <AdminPanel title="完整双语正文"
        ><ElForm label-position="top" :disabled="disabled || busy"
          ><ElFormItem label="完整英文（空行分段）" required
            ><ElInput
              v-model="paragraphs"
              aria-label="完整英文"
              type="textarea"
              :rows="12" /></ElFormItem
          ><ElFormItem label="全文中文翻译" required
            ><ElInput
              v-model="form.translation_zh"
              aria-label="全文中文翻译"
              type="textarea"
              :rows="10" /></ElFormItem></ElForm
      ></AdminPanel>
      <AdminPanel title="全文音频（选填）"
        ><p>短文可以不配音频。上传后核对实际时长、正文与声音；替换形成新候选版本。</p>
        <ElUpload
          :auto-upload="false"
          :show-file-list="false"
          accept=".mp3,.m4a,.wav,.aac"
          :disabled="disabled || busy || audioDisabled"
          @change="emit('audio', $event)"
          ><ElButton :disabled="disabled || busy || audioDisabled" :loading="busy"
            >上传或替换全文音频</ElButton
          ></ElUpload
        >
        <p v-if="audioDisabled">短文专用音频上传接口待装配，可通过统一内容包明确绑定导入</p>
        <template v-if="form.audio"
          ><p>实际时长 {{ (form.audio.duration_ms / 1000).toFixed(2) }} 秒</p>
          <AppAudioPlayer v-if="audioUrl" :src="audioUrl" @playing="audioPlayed = true" />
          <ElCheckbox
            :model-value="form.audio.listening_confirmed === true"
            :disabled="disabled || busy || !audioUrl || !audioPlayed"
            @update:model-value="confirmAudio(Boolean($event))"
            >已实际试听完整音频，确认与本篇正文一致</ElCheckbox
          >
          <div class="audio-actions">
            <ElButton :disabled="disabled || busy" @click="emit('refresh')">刷新试听地址</ElButton
            ><ElButton :disabled="disabled || busy" @click="emit('removeAudio')">移除音频</ElButton>
          </div></template
        ><ElEmpty v-else description="本篇无音频，不影响纯阅读草稿" :image-size="60"
      /></AdminPanel>
    </div>
  </div>
</template>
<style scoped lang="scss">
.short-reading-fields {
  display: grid;
  gap: 18px;
  min-width: 0;

  .metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }

  .reading-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
    align-items: start;
    gap: 18px;
  }

  .cover,
  .audio-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .cover img {
    width: 120px;
    height: 90px;
    object-fit: contain;
  }

  audio {
    width: 100%;
    margin: 14px 0;
  }

  p {
    color: var(--juya-color-text-secondary);
    line-height: 1.7;
  }
}

@media (width <= 1000px) {
  .short-reading-fields .reading-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (width <= 600px) {
  .short-reading-fields .metadata {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

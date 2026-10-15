<script setup lang="ts">
import { ElMessage, ElScrollbar } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { createPronunciationAdminAdapter } from '@/features/audio/pronunciation-admin-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { DialogueRow, LexiconRow } from './scene-form'
import type { AudioElement } from '@/features/audio/segment-player'

import { entrySources } from './entry-sources'
import { normalizeSceneContent } from './scene-form'

const props = defineProps<{
  content: Readonly<Record<string, unknown>>
  revisionId: string
  title?: string
}>()
const content = computed(() => normalizeSceneContent(props.content))
const device = ref('phone')
const urls = ref<Record<string, string>>({})
const resourceError = ref('')
const audioElement = ref<AudioElement | null>(null)
const player = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const adapter = createContentAdapter(useAdminApiClient())
const pronunciations = createPronunciationAdminAdapter(useAdminApiClient())
const pronunciationBusy = ref(false)
let generation = 0
/** 加载该版本引用的签名资源，丢弃过期的并发响应。 */
async function loadResources(): Promise<void> {
  const current = ++generation
  player.value?.stop()
  resourceError.value = ''
  const ids = [
    content.value.original_image_asset_id,
    content.value.cover_asset_id,
    content.value.audio?.asset_id,
    ...content.value.dialogue.map((row) => row.slice_version),
    ...content.value.vocabulary.flatMap((entry) => [entry.icon_asset_id, entry.audio_version_id]),
    ...content.value.chunks.flatMap((entry) => [entry.icon_asset_id, entry.audio_version_id])
  ].filter((id): id is string => Boolean(id))
  const nextUrls: Record<string, string> = {}
  const results = await Promise.allSettled(
    [...new Set(ids)].map(async (id) => {
      nextUrls[id] = (await adapter.signedResource(props.revisionId, id)).url
    })
  )
  if (current !== generation) return
  urls.value = nextUrls
  const assetId = content.value.audio?.asset_id
  player.value?.load(assetId ? (nextUrls[assetId] ?? '') : '')
  if (results.some((result) => result.status === 'rejected'))
    resourceError.value = '部分资源暂不可预览，请保存草稿后刷新预览'
}
/**
 * 播放已经人工确认的独立句子文件
 * @param row - 对话行
 */
const playRow = async (row: DialogueRow): Promise<void> => {
  const audio = content.value.audio
  if (
    !audio ||
    !row.slice_target_id ||
    !row.slice_version ||
    !urls.value[row.slice_version] ||
    !row.timing_confirmed ||
    row.audio_version_id !== audio.version_id
  )
    return
  try {
    await player.value?.play(row.id, urls.value[row.slice_version]!)
  } catch {
    ElMessage.warning('音频播放失败，请刷新签名后重试')
  }
}
/** 播放整段音频。 */
async function playAll(): Promise<void> {
  const audio = content.value.audio
  if (!audio || !urls.value[audio.asset_id]) return
  try {
    await player.value?.play('scene', urls.value[audio.asset_id]!)
  } catch {
    ElMessage.warning('音频播放失败')
  }
}
/**
 * 试听既有固定发音文件，只读取状态与资源版本
 * @param entry - 本篇已保存词条
 */
const playEntry = async (entry: LexiconRow): Promise<void> => {
  if (pronunciationBusy.value) return
  const current = generation
  pronunciationBusy.value = true
  try {
    let url = entry.audio_version_id ? urls.value[entry.audio_version_id] : ''
    if (!url && entry.pronunciation_target_id && pronunciations.available) {
      const target = entry.pronunciation_target_id
      const status = await pronunciations.status(target)
      if (current !== generation) return
      if (status.target_id !== target || !status.resource_version)
        throw new Error('本篇固定发音尚无可试听资源')
      const preview = await pronunciations.preview(target, status.resource_version)
      if (current !== generation) return
      if (preview.resource_version !== status.resource_version)
        throw new Error('发音资源版本已变化，请刷新预览')
      url = preview.url
    }
    if (url && current === generation) await player.value?.play(entry.entry_id, url)
  } catch (failure) {
    if (current === generation)
      ElMessage.warning(failure instanceof Error ? failure.message : '词条发音播放失败')
  } finally {
    pronunciationBusy.value = false
  }
}
/** 暂停当前唯一播放器 */
const pause = (): void => {
  player.value?.pause()
}
watch(() => [props.revisionId, props.content], loadResources, { deep: true, immediate: true })
onMounted(() => {
  if (audioElement.value) player.value = createSegmentPlayer(audioElement.value)
})
onBeforeUnmount(() => {
  generation++
  player.value?.dispose()
})
</script>
<template>
  <div class="scene-preview">
    <div class="preview-controls">
      <ElRadioGroup v-model="device"
        ><ElRadioButton value="phone">手机预览</ElRadioButton
        ><ElRadioButton value="tablet">平板预览</ElRadioButton></ElRadioGroup
      ><ElButton @click="loadResources">刷新预览</ElButton>
    </div>
    <ElAlert v-if="resourceError" :closable="false" :title="resourceError" type="warning" />
    <ElScrollbar
      class="device-scroll"
      max-height="var(--juya-preview-max-height)"
      aria-label="场景预览内容"
      :tabindex="0"
    >
      <article class="device-frame" :class="device">
        <img
          v-if="content.original_image_asset_id && urls[content.original_image_asset_id]"
          class="original-image"
          :src="urls[content.original_image_asset_id]"
          alt="学习原图"
        />
        <div class="preview-body">
          <h3>{{ content.title_en || title || '未命名场景' }}</h3>
          <p class="translation">{{ content.title_zh }}</p>
          <p>{{ content.summary }}</p>
          <div class="tags">
            <ElTag v-for="tag in content.tags" :key="tag" size="small">{{ tag }}</ElTag>
          </div>
          <ElButton v-if="content.audio" :disabled="!urls[content.audio.asset_id]" @click="playAll"
            >{{ player?.label('scene') ?? '播放' }}整段音频</ElButton
          ><ElButton v-if="content.audio" @click="pause">暂停</ElButton>
          <audio
            v-show="content.audio"
            ref="audioElement"
            class="preview-audio"
            controls
            preload="metadata"
            aria-label="预览音频播放器"
          />
          <p v-if="content.audio" aria-live="polite">
            {{ player?.statusText.value }} {{ player?.error.value }}
          </p>
          <p
            v-else-if="
              content.template_type !== 'word_card' && content.template_type !== 'vocabulary'
            "
            role="status"
          >
            尚未绑定整段音频，请在音频切片步骤上传并绑定该场景的录音
          </p>
          <ElButton v-if="player?.status.value === 'error'" @click="loadResources"
            >刷新音频后重试</ElButton
          >
          <p v-if="content.audio" class="audio-help">
            播放中仍无声？请检查播放器、浏览器和系统音量，以及耳机或音箱的输出设备。
          </p>
          <p v-if="player?.activeId.value" aria-live="polite">
            当前：{{
              content.dialogue.find((row) => row.id === player?.activeId.value)?.english ||
              (player.activeId.value === 'scene' ? '整段音频' : '词条发音')
            }}
          </p>
          <div v-for="(row, index) in content.dialogue" :key="row.id" class="preview-dialogue">
            <span class="speaker">{{ row.speaker || `句子 ${index + 1}` }}</span>
            <p class="english">{{ row.english }}</p>
            <p class="translation">{{ row.chinese }}</p>
            <ElButton
              :disabled="
                !content.audio ||
                !row.slice_target_id ||
                !row.slice_version ||
                !urls[row.slice_version] ||
                row.audio_version_id !== content.audio.version_id ||
                !row.timing_confirmed
              "
              @click="playRow(row)"
              >{{ player?.label(row.id) ?? '播放' }}句子 {{ index + 1 }}</ElButton
            >
          </div>
          <template
            v-for="section in [
              { key: 'vocabulary', title: '重点词汇' },
              { key: 'chunks', title: '常用语块' }
            ]"
            :key="section.key"
            ><h4 v-if="content[section.key].length">{{ section.title }}</h4>
            <div class="entry-grid">
              <article
                v-for="entry in section.key === 'vocabulary' ? content.vocabulary : content.chunks"
                :key="`${entry.entry_id}:${entry.entry_version}`"
                class="entry-card"
                :class="{ chunk: section.key === 'chunks' }"
              >
                <img
                  v-if="
                    section.key === 'vocabulary' && entry.icon_asset_id && urls[entry.icon_asset_id]
                  "
                  :src="urls[entry.icon_asset_id]"
                  alt="词汇配图"
                />
                <div class="entry-heading">
                  <h3>{{ entry.english }}</h3>
                  <ElButton
                    v-if="
                      entry.audio_version_id ||
                      (entry.pronunciation_target_id && pronunciations.available)
                    "
                    class="entry-play"
                    :aria-label="`${player?.label(entry.entry_id) ?? '播放'} ${entry.english} 发音`"
                    :disabled="
                      pronunciationBusy ||
                      (!entry.pronunciation_target_id &&
                        (!entry.audio_version_id || !urls[entry.audio_version_id]))
                    "
                    @click="playEntry(entry)"
                    >发音</ElButton
                  >
                </div>
                <p v-if="entry.phonetic" class="entry-phonetic">{{ entry.phonetic }}</p>
                <p class="entry-meaning">{{ entry.chinese }}</p>
                <p v-if="entry.explanation" class="entry-explanation">{{ entry.explanation }}</p>
                <div
                  v-for="sentence in entrySources(entry, content.dialogue)"
                  :key="sentence.id"
                  class="entry-source"
                >
                  <strong>来源原句</strong>
                  <p>{{ sentence.english }}</p>
                  <p v-if="sentence.chinese">{{ sentence.chinese }}</p>
                </div>
                <p
                  v-if="!entrySources(entry, content.dialogue).length && entry.source_sentence"
                  class="entry-source"
                >
                  来源原句：{{ entry.source_sentence }}
                </p>
                <small v-if="!entry.audio_version_id && !entry.pronunciation_target_id"
                  >暂无独立发音</small
                >
              </article>
            </div></template
          >
          <p v-if="content.source || content.copyright" class="source">
            {{ content.source }} · {{ content.copyright }}
          </p>
        </div>
      </article>
    </ElScrollbar>
  </div>
</template>
<style scoped lang="scss">
.preview-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.device-scroll {
  --juya-preview-max-height: 68vh;

  max-width: 100%;
}

.device-frame {
  box-sizing: border-box;
  width: 390px;
  max-width: 100%;
  margin: 12px auto;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 24px;
  background: var(--el-bg-color);
}

.tablet {
  width: 768px;
}

.original-image {
  display: block;
  width: 100%;
  max-height: 350px;
  object-fit: contain;
}

.preview-body {
  padding: 24px;
}

h3 {
  margin: 0 0 8px;
  font-size: 23px;
}

.translation,
.source {
  color: var(--juya-color-text-secondary);
}

.preview-audio {
  display: block;
  width: 100%;
  margin-top: 12px;
}

.audio-help {
  color: var(--juya-color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.tags {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.preview-dialogue {
  margin-top: 18px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
}

.speaker {
  color: var(--el-color-primary);
  font-size: 12px;
}

.english {
  font-size: 17px;
  line-height: 1.7;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-bg-color);
  text-align: left;
}

.entry-card {
  .entry-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  p {
    margin: 4px 0;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 0;
    font-size: 18px;
  }

  &.chunk {
    grid-column: 1 / -1;
  }
}

.entry-card img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.source {
  margin-top: 20px;
  font-size: 11px;
}
</style>

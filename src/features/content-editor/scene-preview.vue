<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { DialogueRow, LexiconRow } from './scene-form'
import type { AudioElement } from '@/features/audio/segment-player'

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
let player: ReturnType<typeof createSegmentPlayer> | null = null
const selectedEntry = ref<LexiconRow | null>(null)
const adapter = createContentAdapter(useAdminApiClient())
let generation = 0
/** 加载该版本引用的签名资源，丢弃过期的并发响应。 */
async function loadResources(): Promise<void> {
  const current = ++generation
  player?.stop()
  resourceError.value = ''
  const ids = [
    content.value.original_image_asset_id,
    content.value.cover_asset_id,
    content.value.audio?.asset_id,
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
  if (results.some((result) => result.status === 'rejected'))
    resourceError.value = '部分资源暂不可预览，请保存草稿后刷新预览'
}
/** 播放同一音频中的句子片段。
 * @param row - 对话行
 */
async function playRow(row: DialogueRow): Promise<void> {
  const audio = content.value.audio
  if (
    !audio ||
    !urls.value[audio.asset_id] ||
    row.start_ms === null ||
    row.end_ms === null ||
    row.audio_version_id !== audio.version_id
  )
    return
  try {
    await player?.play(row.id, urls.value[audio.asset_id]!, row.start_ms, row.end_ms)
  } catch {
    ElMessage.warning('音频播放失败，请刷新签名后重试')
  }
}
/** 播放整段音频。 */
async function playAll(): Promise<void> {
  const audio = content.value.audio
  if (!audio || !urls.value[audio.asset_id]) return
  try {
    await player?.play('scene', urls.value[audio.asset_id]!)
  } catch {
    ElMessage.warning('音频播放失败')
  }
}
/** 播放词条的固定发音版本。
 * @param entry - 已选词条
 */
async function playEntry(entry: LexiconRow): Promise<void> {
  const id = entry.audio_version_id
  if (!id || !urls.value[id]) return
  try {
    await player?.play(entry.entry_id, urls.value[id]!)
  } catch {
    ElMessage.warning('词条发音播放失败')
  }
}
/** 按 Unicode 字符偏移拆分可点击文本。
 * @param row - 对话行
 * @returns 普通文本和词卡入口
 */
function tokens(row: DialogueRow): { text: string; entry: LexiconRow | null }[] {
  const chars = Array.from(row.english)
  const parts: { text: string; entry: LexiconRow | null }[] = []
  let cursor = 0
  for (const span of [...row.clickable_spans].sort((a, b) => Number(a.start) - Number(b.start))) {
    const start = Number(span.start)
    const end = Number(span.end)
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < cursor ||
      end <= start ||
      end > chars.length
    )
      continue
    if (start > cursor) parts.push({ text: chars.slice(cursor, start).join(''), entry: null })
    const entry =
      [...content.value.vocabulary, ...content.value.chunks].find(
        (item) => item.entry_id === span.entry_id && item.entry_version === span.entry_version
      ) ?? null
    parts.push({ text: chars.slice(start, end).join(''), entry })
    cursor = end
  }
  parts.push({ text: chars.slice(cursor).join(''), entry: null })
  return parts
}
/** 暂停当前唯一播放器。 */
function pause(): void {
  player?.stop()
}
/** 关闭词卡并停止播放。 */
function closeEntry(): void {
  selectedEntry.value = null
  pause()
}
watch(() => [props.revisionId, props.content], loadResources, { deep: true, immediate: true })
onMounted(() => {
  if (audioElement.value) player = createSegmentPlayer(audioElement.value)
})
onBeforeUnmount(() => {
  generation++
  player?.dispose()
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
    <div class="device-scroll">
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
            >播放整段音频</ElButton
          ><ElButton v-if="content.audio" @click="pause">暂停</ElButton>
          <div v-for="(row, index) in content.dialogue" :key="row.id" class="preview-dialogue">
            <span class="speaker">{{ row.speaker || `句子 ${index + 1}` }}</span>
            <p class="english">
              <template v-for="(part, partIndex) in tokens(row)" :key="partIndex"
                ><button v-if="part.entry" class="word-link" @click="selectedEntry = part.entry">
                  {{ part.text }}</button
                ><template v-else>{{ part.text }}</template></template
              >
            </p>
            <p class="translation">{{ row.chinese }}</p>
            <ElButton
              size="small"
              :disabled="
                !content.audio ||
                row.audio_version_id !== content.audio.version_id ||
                !row.timing_confirmed
              "
              @click="playRow(row)"
              >播放句子 {{ index + 1 }}</ElButton
            >
          </div>
          <template
            v-for="section in [
              { key: 'vocabulary', title: '核心词汇' },
              { key: 'chunks', title: '常用语块' }
            ]"
            :key="section.key"
            ><h4 v-if="content[section.key].length">{{ section.title }}</h4>
            <div class="entry-grid">
              <button
                v-for="entry in section.key === 'vocabulary' ? content.vocabulary : content.chunks"
                :key="`${entry.entry_id}:${entry.entry_version}`"
                class="entry-card"
                @click="selectedEntry = entry"
              >
                <img
                  v-if="entry.icon_asset_id && urls[entry.icon_asset_id]"
                  :src="urls[entry.icon_asset_id]"
                  alt="词条图标"
                /><strong>{{ entry.english }}</strong
                ><small>{{ entry.phonetic }}</small
                ><span>{{ entry.chinese }}</span>
              </button>
            </div></template
          >
          <p v-if="content.source || content.copyright" class="source">
            {{ content.source }} · {{ content.copyright }}
          </p>
        </div>
      </article>
    </div>
    <audio ref="audioElement" preload="metadata" />
    <ElDialog
      :model-value="Boolean(selectedEntry)"
      title="词卡"
      width="min(440px, 90vw)"
      @close="closeEntry"
      ><template v-if="selectedEntry"
        ><h3>{{ selectedEntry.english }}</h3>
        <p>{{ selectedEntry.phonetic }}</p>
        <p>{{ selectedEntry.chinese }}</p>
        <p>{{ selectedEntry.explanation }}</p>
        <small>固定版本 v{{ selectedEntry.entry_version }}</small>
        <p v-if="!selectedEntry.audio_version_id">暂无独立发音</p>
        <ElButton
          v-else
          :disabled="!urls[selectedEntry.audio_version_id]"
          @click="playEntry(selectedEntry)"
          >播放词条发音</ElButton
        ></template
      ></ElDialog
    >
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
  max-width: 100%;
  max-height: 68vh;
  overflow: auto;
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

.word-link {
  padding: 0;
  border: 0;
  border-bottom: 1px dotted var(--el-color-primary);
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
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
  cursor: pointer;
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

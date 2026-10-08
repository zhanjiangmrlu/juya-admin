<script setup lang="ts">
import { VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage, ElScrollbar } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

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
const selectedSourceId = ref<string | null>(null)
const selectedEntry = ref<LexiconRow | null>(null)
const adapter = createContentAdapter(useAdminApiClient())
let entryTrigger: globalThis.HTMLElement | null = null
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
    await player.value?.play(row.id, urls.value[audio.asset_id]!, row.start_ms, row.end_ms)
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
/** 播放词条的固定发音版本。
 * @param entry - 已选词条
 */
async function playEntry(entry: LexiconRow): Promise<void> {
  const id = entry.audio_version_id
  if (!id || !urls.value[id]) return
  try {
    await player.value?.play(entry.entry_id, urls.value[id]!)
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
  player.value?.pause()
}
/** 保留实际点词来源并打开固定版本词卡。
 * @param entry - 所选固定词条
 * @param sentenceId - 实际点词的稳定句子编号
 * @param event - 词卡入口点击事件，用于返回时恢复焦点
 */
function openEntry(
  entry: LexiconRow,
  sentenceId: string | null = null,
  event?: globalThis.MouseEvent
): void {
  entryTrigger = event?.currentTarget instanceof globalThis.HTMLElement ? event.currentTarget : null
  selectedEntry.value = entry
  selectedSourceId.value = sentenceId
}
/** 关闭词卡，恢复整段音源供原生控件播放。 */
function closeEntry(): void {
  if (!selectedEntry.value) return
  selectedEntry.value = null
  selectedSourceId.value = null
  const assetId = content.value.audio?.asset_id
  player.value?.load(assetId ? (urls.value[assetId] ?? '') : '')
}
/** 返回打开词卡的位置，保留键盘阅读位置。 */
function restoreOriginalFocus(): void {
  entryTrigger?.focus({ preventScroll: true })
}
/** 关闭词卡，返回来源原文或词条列表。 */
async function returnToOriginal(): Promise<void> {
  closeEntry()
  await nextTick()
  restoreOriginalFocus()
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
          <p v-else role="status">尚未绑定整段音频，请在音频标时步骤上传并绑定该场景的录音</p>
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
            <p class="english">
              <template v-for="(part, partIndex) in tokens(row)" :key="partIndex"
                ><button
                  v-if="part.entry"
                  class="word-link"
                  @click="openEntry(part.entry, row.id, $event)"
                >
                  {{ part.text }}</button
                ><template v-else>{{ part.text }}</template></template
              >
            </p>
            <p class="translation">{{ row.chinese }}</p>
            <ElButton
              :disabled="
                !content.audio ||
                row.audio_version_id !== content.audio.version_id ||
                !row.timing_confirmed
              "
              @click="playRow(row)"
              >{{ player?.label(row.id) ?? '播放' }}句子 {{ index + 1 }}</ElButton
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
                @click="openEntry(entry, null, $event)"
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
    </ElScrollbar>
    <ElDialog
      :model-value="Boolean(selectedEntry)"
      title="词卡"
      width="min(440px, 90vw)"
      @close="closeEntry"
      @closed="restoreOriginalFocus"
      ><template v-if="selectedEntry"
        ><div class="entry-sheet">
          <div class="entry-heading">
            <h3>{{ selectedEntry.english }}</h3>
            <ElButton
              class="entry-play"
              type="primary"
              circle
              :aria-label="`${player?.label(selectedEntry.entry_id) ?? '播放'} ${selectedEntry.english} 发音`"
              :disabled="!selectedEntry.audio_version_id || !urls[selectedEntry.audio_version_id]"
              @click="playEntry(selectedEntry)"
              ><ElIcon
                ><VideoPause
                  v-if="
                    player?.activeId.value === selectedEntry.entry_id &&
                    ['playing', 'loading'].includes(player.status.value)
                  " /><VideoPlay v-else /></ElIcon
            ></ElButton>
          </div>
          <p class="entry-phonetic">{{ selectedEntry.phonetic || '音标待补充' }}</p>
          <p class="entry-meaning">{{ selectedEntry.chinese }}</p>
          <p v-if="selectedEntry.explanation" class="entry-explanation">
            {{ selectedEntry.explanation }}
          </p>
          <div
            v-for="sentence in entrySources(selectedEntry, content.dialogue, selectedSourceId)"
            :key="sentence.id"
            class="entry-source"
          >
            <strong>来源原句</strong>
            <p>{{ sentence.speaker }} · {{ sentence.english }}</p>
            <p v-if="sentence.chinese">{{ sentence.chinese }}</p>
          </div>
          <p v-if="!entrySources(selectedEntry, content.dialogue, selectedSourceId).length">
            当前版本未关联来源原句
          </p>
          <p v-if="!selectedEntry.audio_version_id" class="entry-missing">
            <span>暂无独立发音</span>，待补充素材
          </p>
          <p v-else-if="!urls[selectedEntry.audio_version_id]" class="entry-missing">
            发音资源暂不可用，请刷新预览
          </p>
          <p v-if="player?.activeId.value === selectedEntry.entry_id" aria-live="polite">
            {{ player.statusText.value }} {{ player.error.value }}
          </p>
          <ElButton v-if="player?.status.value === 'error'" @click="loadResources"
            >刷新音频后重试</ElButton
          >
          <div class="entry-footer">
            <small>固定版本 v{{ selectedEntry.entry_version }}</small>
            <ElButton type="primary" @click="returnToOriginal">返回原文</ElButton>
          </div>
        </div></template
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

.entry-sheet {
  padding: 24px;
  border-radius: 12px;
  background: #f7f1e2;
  color: var(--juya-color-text-primary);
}

.entry-heading {
  display: flex;
  align-items: center;
  gap: 16px;

  h3 {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 32px;
    line-height: 1.2;
  }
}

.entry-play {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  font-size: 20px;
}

.entry-phonetic,
.entry-missing {
  color: var(--juya-color-text-secondary);
}

.entry-meaning {
  margin-top: 20px;
  font-size: 20px;
  font-weight: 600;
}

.entry-explanation,
.entry-source {
  line-height: 1.7;
}

.entry-source {
  margin-top: 20px;

  p {
    margin: 8px 0;
  }
}

.entry-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
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

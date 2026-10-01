<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { createContentAdapter } from '@/features/content/content-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { LexiconRow } from './scene-form'
import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { UploadFile } from 'element-plus'

import { type IconCrop, previewCrop, suggestCrop } from './icon-crop'
import { createSceneMediaAdapter } from './scene-media-adapter'

const props = defineProps<{
  entry: LexiconRow
  entryType: 'vocabulary' | 'chunk'
  originalImageAssetId?: string | null
}>()
const emit = defineEmits<{ update: [entry: LexiconRow]; busy: [value: boolean] }>()
const client = useAdminApiClient()
const content = createContentAdapter(client)
const media = createSceneMediaAdapter(client)
const audio = createAudioAdapter(client)
const busy = ref(false)
watch(busy, (value) => emit('busy', value), { flush: 'sync' })
const error = ref('')
const iconPreview = ref('')
const proposedIcon = shallowRef<globalThis.File | null>(null)
const originalUrl = ref('')
const crop = reactive<IconCrop>({ x: 0, y: 0, width: 100, height: 100 })
const cropOpened = ref(false)
const versions = ref<AudioVersion[]>([])
const selectedVersion = ref('')
let pendingFile: globalThis.File | null = null
let uploadKey = ''
let confirmKey = ''
let confirmedVersion = ''
let pendingIconAsset: string | null = null
let listenGeneration = 0
let player: ReturnType<typeof createSegmentPlayer> | null = null
const playback = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const audioElement = ref<globalThis.HTMLAudioElement | null>(null)

/**
 * 保留可读素材错误，供人工重试。
 * @param failure - 捕获的操作异常
 */
function fail(failure: unknown): void {
  error.value = failure instanceof Error ? failure.message : '素材操作失败'
}
/** 释放待确认本地图标预览。 */
function cancelIcon(): void {
  if (iconPreview.value) globalThis.URL.revokeObjectURL(iconPreview.value)
  iconPreview.value = ''
  proposedIcon.value = null
  pendingIconAsset = null
}
/**
 * 将替代图标暂存为待确认预览。
 * @param file - 管理员选定的本地素材
 */
function chooseIcon(file: UploadFile): void {
  if (!file.raw) return
  cancelIcon()
  proposedIcon.value = file.raw
  iconPreview.value = globalThis.URL.createObjectURL(file.raw)
}
/** 确认图标素材后更新词条引用。 */
async function confirmIcon(): Promise<void> {
  if (!proposedIcon.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (!pendingIconAsset) {
      const asset = await media.uploadImage(proposedIcon.value)
      pendingIconAsset = asset.id
    }
    const asset = await media.metadata(pendingIconAsset)
    if (asset.status !== 'CONFIRMED') throw new Error('图标尚在检查，请稍后重新确认同一素材')
    emit('update', { ...props.entry, icon_asset_id: asset.id })
    cancelIcon()
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/** 读取原图并准备人工裁切建议。 */
async function openCrop(): Promise<void> {
  if (!props.originalImageAssetId) return
  busy.value = true
  error.value = ''
  try {
    const [signed, metadata] = await Promise.all([
      media.signedUrl(props.originalImageAssetId),
      media.metadata(props.originalImageAssetId)
    ])
    originalUrl.value = signed.url
    Object.assign(crop, suggestCrop(metadata.width ?? 100, metadata.height ?? 100))
    cropOpened.value = true
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/** 生成待确认裁切预览，不自动上传。 */
async function prepareCrop(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const file = await previewCrop(originalUrl.value, crop)
    cancelIcon()
    proposedIcon.value = file
    iconPreview.value = globalThis.URL.createObjectURL(file)
    cropOpened.value = false
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/** 为已登记词条创建稳定独立发音目标。
 * @returns 词条稳定发音目标编号
 */
async function ensureTarget(): Promise<string> {
  let entry = props.entry
  if (!entry.entry_id) {
    entry = await content.saveLexicon(entry, props.entryType)
    emit('update', entry)
  }
  const target = await media.createEntryAudioTarget(entry.entry_id, props.entryType)
  return target.id
}
/** 读取词条发音候选与历史版本。 */
async function loadVersions(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const targetId = await ensureTarget()
    versions.value = await audio.listVersions(targetId)
    selectedVersion.value = props.entry.audio_version_id ?? ''
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/**
 * 上传人工发音候选且复用失败命令键。
 * @param file - 管理员选定的本地素材
 */
async function uploadAudio(file: UploadFile): Promise<void> {
  if (!file.raw || busy.value) return
  if (pendingFile !== file.raw) {
    pendingFile = file.raw
    uploadKey = createIdempotencyKey()
  }
  busy.value = true
  error.value = ''
  try {
    const targetId = await ensureTarget()
    const version = await audio.uploadFile(
      targetId,
      file.raw,
      uploadKey,
      () => undefined,
      new globalThis.AbortController().signal
    )
    versions.value = await audio.listVersions(targetId)
    selectedVersion.value = version.id
    pendingFile = null
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/** 确认所选候选并绑定固定发音版本。 */
async function bindVersion(): Promise<void> {
  const version = versions.value.find((item) => item.id === selectedVersion.value)
  if (!version || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (version.status === 'CANDIDATE') {
      if (confirmedVersion !== version.id) {
        confirmedVersion = version.id
        confirmKey = createIdempotencyKey()
      }
      await audio.confirmVersion(version.id, confirmKey)
    }
    emit('update', {
      ...props.entry,
      audio_target_id: version.targetId,
      audio_version_id: version.id
    })
    versions.value = await audio.listVersions(version.targetId)
  } catch (failure) {
    fail(failure)
  } finally {
    busy.value = false
  }
}
/** 使用统一播放器试听所选发音。 */
async function listen(): Promise<void> {
  const version = versions.value.find((item) => item.id === selectedVersion.value)
  if (!version || !audioElement.value) return
  player ??= createSegmentPlayer(audioElement.value)
  playback.value = player
  const current = ++listenGeneration
  try {
    const same = player.activeId.value === version.id && player.status.value !== 'error'
    const url = same
      ? (audioElement.value.getAttribute('src') ?? '')
      : (await media.signedUrl(version.assetId)).url
    if (current === listenGeneration) await player.play(version.id, url)
  } catch (failure) {
    fail(failure)
  }
}
watch(selectedVersion, () => {
  listenGeneration++
  player?.stop()
})
onBeforeUnmount(() => {
  listenGeneration++
  player?.dispose()
  cancelIcon()
})
</script>
<template>
  <fieldset :disabled="busy" :inert="busy" class="lexicon-media-fields">
    <ElAlert v-if="error" :closable="false" :title="error" type="error" />
    <p>图标与独立发音均为可选。替换后保存词库版本及草稿，线上完整版本仍通过检查发布。</p>
    <ElUpload
      :auto-upload="false"
      :show-file-list="false"
      accept="image/png,image/jpeg,image/webp"
      @change="chooseIcon"
      ><ElButton>选择替代图标</ElButton></ElUpload
    >
    <ElButton :disabled="!originalImageAssetId" @click="openCrop">从原图准备裁切建议</ElButton>
    <div v-if="proposedIcon">
      <img :src="iconPreview" alt="待确认图标" class="icon-preview" />
      <p>请确认图标语义清晰、裁切范围正确，避免无语义黑块。</p>
      <ElButton @click="confirmIcon">确认使用图标</ElButton
      ><ElButton @click="cancelIcon">放弃图标建议</ElButton>
    </div>
    <p>当前图标：{{ entry.icon_asset_id || '无' }}</p>
    <ElButton v-if="entry.icon_asset_id" @click="emit('update', { ...entry, icon_asset_id: null })"
      >移除图标引用</ElButton
    >
    <ElButton :disabled="!entry.english.trim()" @click="loadVersions"
      >创建／加载独立发音目标</ElButton
    >
    <ElUpload
      :auto-upload="false"
      :show-file-list="false"
      :disabled="!entry.english.trim()"
      accept=".mp3,.m4a,.wav,.aac"
      @change="uploadAudio"
      ><ElButton :disabled="!entry.english.trim()">上传可选独立发音</ElButton></ElUpload
    >
    <ElSelect v-model="selectedVersion" placeholder="选择候选或历史发音"
      ><ElOption
        v-for="version in versions"
        :key="version.id"
        :value="version.id"
        :label="`v${version.versionNo} · ${version.status}`"
    /></ElSelect>
    <ElButton :disabled="!selectedVersion" @click="listen"
      >{{ playback?.label(selectedVersion) ?? '试听' }}发音</ElButton
    ><ElButton :disabled="!selectedVersion" @click="bindVersion">确认并绑定所选发音</ElButton>
    <ElButton
      v-if="entry.audio_version_id || entry.audio_target_id"
      @click="emit('update', { ...entry, audio_target_id: null, audio_version_id: null })"
      >移除发音引用</ElButton
    >
    <p aria-live="polite">{{ playback?.statusText.value }} {{ playback?.error.value }}</p>
    <audio ref="audioElement" preload="metadata" />
  </fieldset>
  <ElDialog v-model="cropOpened" title="人工核对图标裁切建议" width="min(640px, 90vw)"
    ><p>中心方形仅为初始建议，请修改像素范围并预览；不会自动识别图标。</p>
    <img :src="originalUrl" alt="裁切来源原图" class="crop-source" /><ElForm label-position="top"
      ><ElFormItem v-for="key in ['x', 'y', 'width', 'height'] as const" :key="key" :label="key"
        ><ElInputNumber v-model="crop[key]" :min="0" :precision="0" /></ElFormItem></ElForm
    ><template #footer
      ><ElButton :loading="busy" @click="prepareCrop">生成待确认预览</ElButton></template
    ></ElDialog
  >
</template>
<style scoped lang="scss">
.lexicon-media-fields {
  min-width: 0;
  margin: 0 0 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
}

.icon-preview {
  display: block;
  width: 96px;
  height: 96px;
  object-fit: contain;
}

.crop-source {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}
</style>

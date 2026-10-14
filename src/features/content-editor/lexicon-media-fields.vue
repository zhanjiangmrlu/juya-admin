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
  modern?: boolean
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
let operationGeneration = 0
let disposed = false
let player: ReturnType<typeof createSegmentPlayer> | null = null
const playback = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
const audioElement = ref<globalThis.HTMLAudioElement | null>(null)
const /** 捕获素材操作所属的稳定条目与角色，迟到完成不得更新另一条
   * @returns 当前操作仍属于原条目的判断
   */ capture = (): (() => boolean) => {
    const generation = operationGeneration,
      entry = props.entry,
      id = entry.entry_id,
      role = props.entryType
    return () =>
      !disposed &&
      generation === operationGeneration &&
      entry === props.entry &&
      (!id || id === props.entry.entry_id) &&
      role === props.entryType
  }

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
const /** 为当前本篇稳定条目创建发音目标，现代未保存条目不能写全局词库
   * @param active - 仍属于发起操作的条目与角色
   * @returns 词条稳定发音目标编号
   */
  ensureTarget = async (active: () => boolean): Promise<string | null> => {
    let entry = props.entry
    const role = props.entryType
    if (props.modern && !entry.entry_id) throw new Error('请先保存本篇候选资料，再上传独立发音')
    if (!entry.entry_id) {
      entry = await content.saveLexicon(entry, role)
      if (!active()) return null
      emit('update', entry)
    }
    const target = await media.createEntryAudioTarget(entry.entry_id, role)
    return active() ? target.id : null
  }
const /** 读取当前稳定条目的发音候选与历史版本 */ loadVersions = async (): Promise<void> => {
    if (busy.value) return
    const active = capture()
    busy.value = true
    error.value = ''
    try {
      const targetId = await ensureTarget(active)
      if (!targetId || !active()) return
      const result = await audio.listVersions(targetId)
      if (!active()) return
      versions.value = result
      selectedVersion.value = props.entry.audio_version_id ?? ''
    } catch (failure) {
      if (active()) fail(failure)
    } finally {
      if (active()) busy.value = false
    }
  }
const /**
   * 上传当前条目的人工发音候选，失败重试复用原文件及命令键
   * @param file - 管理员选定的本地素材
   */
  uploadAudio = async (file: UploadFile): Promise<void> => {
    if (!file.raw || busy.value) return
    const active = capture()
    if (pendingFile !== file.raw) {
      pendingFile = file.raw
      uploadKey = createIdempotencyKey()
    }
    busy.value = true
    error.value = ''
    try {
      const targetId = await ensureTarget(active)
      if (!targetId || !active()) return
      const version = await audio.uploadFile(
        targetId,
        file.raw,
        uploadKey,
        () => undefined,
        new globalThis.AbortController().signal
      )
      if (!active()) return
      const result = await audio.listVersions(targetId)
      if (!active()) return
      versions.value = result
      selectedVersion.value = version.id
      pendingFile = null
    } catch (failure) {
      if (active()) fail(failure)
    } finally {
      if (active()) busy.value = false
    }
  }
const /** 明确绑定当前条目的固定上传版本，变更后须重新核对本篇发音 */ bindVersion =
    async (): Promise<void> => {
      const version = versions.value.find((item) => item.id === selectedVersion.value)
      if (!version || busy.value) return
      const active = capture()
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
        if (!active()) return
        emit('update', {
          ...props.entry,
          audio_target_id: version.targetId,
          audio_version_id: version.id,
          ...(props.modern &&
          (props.entry.audio_target_id !== version.targetId ||
            props.entry.audio_version_id !== version.id)
            ? { confirmed: false, pronunciation_target_id: null }
            : {})
        })
        const result = await audio.listVersions(version.targetId)
        if (active()) versions.value = result
      } catch (failure) {
        if (active()) fail(failure)
      } finally {
        if (active()) busy.value = false
      }
    }
const /** 试听当前条目所选固定文件，不写人工确认或触发合成 */ listen = async (): Promise<void> => {
    const version = versions.value.find((item) => item.id === selectedVersion.value)
    if (!version || !audioElement.value) return
    const active = capture()
    player ??= createSegmentPlayer(audioElement.value)
    playback.value = player
    const current = ++listenGeneration
    try {
      const same = player.activeId.value === version.id && player.status.value !== 'error'
      const url = same
        ? (audioElement.value.getAttribute('src') ?? '')
        : (await media.signedUrl(version.assetId)).url
      if (active() && current === listenGeneration) await player.play(version.id, url)
    } catch (failure) {
      if (active() && current === listenGeneration) fail(failure)
    }
  }
const /** 移除当前上传引用，现代条目的旧固定发音确认不沿用 */ removeAudio = (): void => {
    emit('update', {
      ...props.entry,
      audio_target_id: null,
      audio_version_id: null,
      ...(props.modern ? { confirmed: false, pronunciation_target_id: null } : {})
    })
  }
const /** 切换条目或角色时隔离素材状态，不把原请求重试键转交新条目 */ invalidate = (): void => {
    operationGeneration++
    listenGeneration++
    player?.load('')
    versions.value = []
    selectedVersion.value = ''
    pendingFile = null
    uploadKey = confirmKey = confirmedVersion = ''
    busy.value = false
    error.value = ''
  }
watch(() => [props.entry, props.entryType], invalidate, { flush: 'sync' })
watch(
  () => props.entry.entry_id,
  (next, prior) => {
    // 旧词库登记在同一行首次分配 ID；这是原操作的确权，不是跨条目切换
    if (!props.modern && !prior && next) return
    invalidate()
  },
  { flush: 'sync' }
)
watch(selectedVersion, () => {
  listenGeneration++
  player?.stop()
})
onBeforeUnmount(() => {
  disposed = true
  operationGeneration++
  listenGeneration++
  player?.dispose()
  cancelIcon()
})
</script>
<template>
  <fieldset :disabled="busy" :inert="busy" class="lexicon-media-fields">
    <ElAlert v-if="error" :closable="false" :title="error" type="error" />
    <p>素材选填，替换后保存当前草稿，线上完整版本仍通过检查发布</p>
    <template v-if="entryType === 'vocabulary'">
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
      <ElButton
        v-if="entry.icon_asset_id"
        @click="emit('update', { ...entry, icon_asset_id: null })"
        >移除图标引用</ElButton
      >
    </template>
    <div class="entry-audio-fields">
      <p v-if="modern && !entry.entry_id">请先保存本篇候选资料，再上传独立发音</p>
      <ElButton
        :disabled="!entry.english.trim() || (modern && !entry.entry_id)"
        @click="loadVersions"
        >创建／加载独立发音目标</ElButton
      >
      <ElUpload
        :auto-upload="false"
        :show-file-list="false"
        :disabled="!entry.english.trim() || (modern && !entry.entry_id)"
        accept=".mp3,.m4a,.wav,.aac"
        @change="uploadAudio"
        ><ElButton :disabled="!entry.english.trim() || (modern && !entry.entry_id)"
          >上传可选独立发音</ElButton
        ></ElUpload
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
      <ElButton v-if="entry.audio_version_id || entry.audio_target_id" @click="removeAudio"
        >移除发音引用</ElButton
      >
      <p aria-live="polite">{{ playback?.statusText.value }} {{ playback?.error.value }}</p>
      <audio ref="audioElement" preload="metadata" />
    </div>
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

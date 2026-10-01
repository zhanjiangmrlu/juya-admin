<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import DialogueFields from '@/features/content-editor/dialogue-fields.vue'

import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { AudioElement, createSegmentPlayer } from '@/features/audio/segment-player'
import type { DialogueRow, SceneContent } from '@/features/content-editor/scene-form'
import type { UploadFile } from 'element-plus'

const props = defineProps<{
  form: SceneContent
  versions: AudioVersion[]
  selectedVersion: string
  pendingFile: UploadFile | null
  busy: boolean
  player: ReturnType<typeof createSegmentPlayer> | null
  canRecord: boolean
}>()
const emit = defineEmits<{
  load: []
  upload: [file: UploadFile]
  bind: [id: string]
  play: [row?: DialogueRow]
  record: [row: DialogueRow, edge: 'start_ms' | 'end_ms']
  refresh: []
  remove: []
  element: [element: AudioElement | null]
}>()
const audioElement = ref<AudioElement | null>(null)
const form = computed(() => props.form)

onMounted(() => emit('element', audioElement.value))
onBeforeUnmount(() => emit('element', null))
</script>

<template>
  <div class="scene-audio-panel">
    <ElCard shadow="never">
      <template #header><h3>整段音频</h3></template>
      <p>绑定固定音频版本。更换版本后需重新标记并核对每句时间。</p>
      <div class="audio-actions">
        <ElButton :loading="busy" @click="emit('load')">加载音频版本</ElButton>
        <ElUpload
          :auto-upload="false"
          :show-file-list="false"
          accept=".mp3,.m4a,.wav,.aac"
          :disabled="busy"
          @change="emit('upload', $event)"
        >
          <ElButton :loading="busy">上传整段音频</ElButton>
        </ElUpload>
        <ElButton v-if="pendingFile" :loading="busy" @click="emit('upload', pendingFile)">
          重新确认已上传音频
        </ElButton>
      </div>
      <ElSelect
        :model-value="selectedVersion"
        aria-label="整段音频版本"
        placeholder="选择固定版本"
        :disabled="busy"
        @update:model-value="emit('bind', String($event))"
      >
        <ElOption
          v-for="version in versions"
          :key="version.id"
          :label="`v${version.versionNo} · ${version.status} · ${version.assetId}`"
          :value="version.id"
        />
      </ElSelect>
      <template v-if="form.audio">
        <p>当前 {{ form.audio.version_id }} · {{ form.audio.duration_ms }} 毫秒</p>
        <ElButton @click="emit('play')">{{ player?.label('scene') ?? '播放' }}整段音频</ElButton>
        <p aria-live="polite">
          当前 {{ player?.currentMs.value ?? 0 }} 毫秒 · {{ player?.statusText.value }}
          {{ player?.error.value }}
        </p>
        <div class="audio-actions">
          <ElButton @click="emit('refresh')">刷新音频地址</ElButton>
          <ElButton :disabled="busy" @click="emit('remove')">移除整段音频</ElButton>
        </div>
      </template>
      <audio ref="audioElement" controls preload="metadata" />
    </ElCard>
    <ElCard shadow="never">
      <template #header><h3>对话与句子标时</h3></template>
      <DialogueFields
        v-model="form.dialogue"
        :audio="form.audio"
        :playback="player"
        :can-record="canRecord"
        timing
        @play="emit('play', $event)"
        @record="(row, edge) => emit('record', row, edge)"
      />
    </ElCard>
  </div>
</template>

<style scoped lang="scss">
.scene-audio-panel {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(420px, 3fr);
  align-items: start;
  gap: 14px;
}

h3 {
  margin: 0;
  font-size: 15px;
}

p {
  color: var(--juya-color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.audio-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

audio {
  width: 100%;
  margin-top: 12px;
}

@media (width <= 1050px) {
  .scene-audio-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

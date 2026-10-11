<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import playIcon from '@/features/audio/assets/audio-play.svg'
import SentenceSlicesPanel from '@/features/audio/sentence-slices-panel.vue'

import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { AudioElement, createSegmentPlayer } from '@/features/audio/segment-player'
import type { SceneRevision } from '@/features/content/content-model'
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
  revisionId: string
  expectedVersion: number
  prepare: () => Promise<SceneRevision | null>
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
  saved: [revision: SceneRevision]
  sliceBusy: [value: boolean]
}>()
const audioElement = ref<AudioElement | null>(null)
const form = computed(() => props.form)

onMounted(() => emit('element', audioElement.value))
onBeforeUnmount(() => emit('element', null))
</script>

<template>
  <div class="scene-audio-panel admin-brand-headings">
    <AdminPanel
      :title="ADMIN_SECTION_TITLES.sceneAudioPanel.audioSourcePanel"
      class="audio-source-panel"
    >
      <p>整段音频与句子边界绑定同一候选版本。更换原音频后重新生成受影响切片。</p>
      <details class="source-management">
        <summary>上传 / 替换与选择音频版本</summary>
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
      </details>
      <template v-if="form.audio">
        <p class="audio-version-meta">
          当前 {{ form.audio.version_id }} · {{ form.audio.duration_ms }} 毫秒
        </p>
        <ElButton class="whole-audio-button" @click="emit('play')"
          ><img :src="playIcon" alt="" />{{ player?.label('scene') ?? '播放' }}整段音频</ElButton
        >
        <div class="audio-timeline">
          <ElProgress
            :percentage="
              Math.min(100, ((player?.currentMs.value ?? 0) / form.audio.duration_ms) * 100)
            "
            :show-text="false"
            :stroke-width="32"
          />
          <div class="timeline-labels">
            <span>{{ ((player?.currentMs.value ?? 0) / 1000).toFixed(3) }} 秒</span
            ><span>{{ form.dialogue.length }}句</span
            ><span>{{ (form.audio.duration_ms / 1000).toFixed(3) }} 秒</span>
          </div>
        </div>
        <p class="player-status" aria-live="polite">
          当前 {{ player?.currentMs.value ?? 0 }} 毫秒 · {{ player?.statusText.value }}
          {{ player?.error.value }}
        </p>
        <div class="audio-actions">
          <ElButton @click="emit('refresh')">刷新音频地址</ElButton>
          <ElButton :disabled="busy" @click="emit('remove')">移除整段音频</ElButton>
        </div>
      </template>
      <audio ref="audioElement" controls preload="metadata" />
    </AdminPanel>
    <SentenceSlicesPanel
      :form="form"
      :revision-id="revisionId"
      :expected-version="expectedVersion"
      :prepare="prepare"
      :disabled="busy"
      @saved="emit('saved', $event)"
      @busy="emit('sliceBusy', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.scene-audio-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 18px;
}

.scene-audio-panel > :deep(.el-card:first-child) {
  background: var(--juya-color-surface);
}

.scene-audio-panel :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.scene-audio-panel :deep(.el-card__body) {
  padding-top: 12px;
}

.scene-audio-panel :deep(.el-select) {
  max-width: 620px;
}

.audio-source-panel :deep(.el-card__body) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 10px 18px;
}

.source-management {
  summary {
    color: var(--el-color-primary);
    cursor: pointer;
  }

  &[open] summary {
    margin-bottom: 16px;
  }
}

.whole-audio-button {
  width: fit-content;

  img {
    margin-right: 8px;
  }
}

.audio-timeline {
  padding: 16px;
  background: #e2eed9;

  .timeline-labels {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    color: var(--el-color-primary);
    font-size: 11px;
  }
}

.audio-source-panel p {
  margin: 0;
}

.audio-source-panel p:first-child,
.audio-source-panel .player-status {
  grid-column: 1 / -1;
}

.audio-source-panel .audio-actions {
  margin: 0;
}

.audio-source-panel audio {
  height: 40px;
  margin: 0;
}

.scene-audio-panel :deep(.dialogue-row .el-form) {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px 16px;
}

.scene-audio-panel :deep(.dialogue-row .el-form-item) {
  min-width: 0;
  margin-bottom: 0;
}

.scene-audio-panel :deep(.timing-fields) {
  grid-column: 1 / -1;
}

.scene-audio-panel :deep(.timing-fields .el-input-number) {
  width: 130px;
}

h3 {
  margin: 0;
  color: var(--juya-color-sidebar);
  font-size: 20px;
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
  .scene-audio-panel,
  .audio-source-panel :deep(.el-card__body),
  .scene-audio-panel :deep(.dialogue-row .el-form) {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

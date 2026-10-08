<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'

import { ADMIN_SECTION_TITLES, ADMIN_TABLE_COLUMNS } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DataTable from '@/components/data-table/data-table.vue'
import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { createSegmentPlayer } from '@/features/audio/segment-player'
import { useAudioVersions } from '@/features/audio/use-audio-versions'
import { createSceneMediaAdapter } from '@/features/content-editor/scene-media-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AudioElement } from '@/features/audio/segment-player'
import type { UploadFile } from 'element-plus'

const route = useRoute()
const sceneId = computed(() => String(route.params.id))
const controller = useAudioVersions(createAudioAdapter(useAdminApiClient()), sceneId.value)
const { error, selectedTarget, state, targets, uploads, versions } = controller
const selectedTargetId = ref('')
const busy = computed(() => state.value === 'loading' || state.value === 'saving')
const media = createSceneMediaAdapter(useAdminApiClient())
const audioElement = ref<AudioElement | null>(null)
const player = shallowRef<ReturnType<typeof createSegmentPlayer> | null>(null)
let previewGeneration = 0

onMounted(async () => {
  if (audioElement.value) player.value = createSegmentPlayer(audioElement.value)
  try {
    await controller.load()
    selectedTargetId.value = selectedTarget.value?.id ?? ''
  } catch {
    // The controller exposes the loading error.
  }
})

/**
 * 切换当前音频目标
 * @param value - 目标编号
 */
async function selectTarget(value: string): Promise<void> {
  previewGeneration++
  player.value?.stop()
  try {
    await controller.selectTarget(value)
  } catch {
    selectedTargetId.value = selectedTarget.value?.id ?? ''
  }
}
/** 试听服务端验证过的实际音频版本。
 * @param versionId - 音频版本
 * @param assetId - 素材编号
 */
async function listen(versionId: string, assetId: string): Promise<void> {
  const current = ++previewGeneration
  try {
    if (player.value?.activeId.value === versionId && player.value.status.value !== 'error') {
      await player.value.play(versionId, audioElement.value?.getAttribute('src') ?? '')
      return
    }
    player.value?.stop()
    const signed = await media.signedUrl(assetId)
    if (current === previewGeneration) await player.value?.play(versionId, signed.url)
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '音频试听失败')
  }
}
onBeforeUnmount(() => {
  previewGeneration++
  player.value?.dispose()
})

/**
 * 将选择的音频加入受控上传队列
 * @param uploadFile - Element Plus 上传文件
 */
function addUpload(uploadFile: UploadFile): void {
  if (!uploadFile.raw) return
  try {
    controller.addUploads([uploadFile.raw])
  } catch (failure) {
    ElMessage.warning(failure instanceof Error ? failure.message : '音频文件不符合要求')
  }
}

/** 启动全部排队或失败的音频上传。 */
async function startUploads(): Promise<void> {
  await controller.startAllUploads()
}

/**
 * 确认一个候选音频版本
 * @param versionId - 候选版本编号
 */
async function confirmVersion(versionId: string): Promise<void> {
  try {
    await controller.confirm(versionId)
    ElMessage.success('音频版本已确认')
  } catch {
    // The controller exposes the operation error.
  }
}

/**
 * 回退到一个历史音频版本
 * @param versionId - 历史版本编号
 */
async function rollbackVersion(versionId: string): Promise<void> {
  try {
    await controller.rollback(versionId)
    ElMessage.success('音频版本已回退')
  } catch {
    // The controller exposes the operation error.
  }
}
</script>

<template>
  <section v-loading="state === 'loading'" class="audio-version-page admin-brand-headings">
    <div class="page-heading">
      <div>
        <p>音频版本管理 · {{ sceneId }}</p>
      </div>
      <ElTag type="info">单批最多 300 个</ElTag>
    </div>
    <p>
      确认与回退维护音频目标版本；已发布场景仍固定原音频，需在场景草稿中绑定并检查发布完整版本。
    </p>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" show-icon />
    <div class="audio-grid">
      <AdminPanel :title="ADMIN_SECTION_TITLES.audioVersion.audioTarget">
        <ElEmpty
          v-if="targets.length === 0 && state !== 'loading'"
          description="当前场景暂无音频目标"
        />
        <ElSelect
          v-else
          v-model="selectedTargetId"
          aria-label="音频目标"
          placeholder="选择句子或词条"
          @change="selectTarget"
        >
          <ElOption
            v-for="target in targets"
            :key="target.id"
            :label="`${target.stableKey} · ${target.targetType}`"
            :value="target.id"
          />
        </ElSelect>
        <ElDescriptions v-if="selectedTarget" :column="1" border>
          <ElDescriptionsItem label="稳定编号">{{ selectedTarget.stableKey }}</ElDescriptionsItem>
          <ElDescriptionsItem label="当前版本">
            {{ selectedTarget.activeVersionId ?? '尚未确认' }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <ElDivider />
        <ElUpload
          :auto-upload="false"
          :disabled="busy || !selectedTarget"
          :limit="300"
          :show-file-list="false"
          accept=".mp3,.m4a,.wav,.aac,audio/*"
          multiple
          @change="addUpload"
        >
          <ElButton :disabled="busy || !selectedTarget">选择音频文件</ElButton>
        </ElUpload>
        <p>文件名（不含扩展名）精确匹配稳定编号或目标编号；未匹配项请逐项选择目标。</p>
        <div v-if="uploads.length" class="upload-queue">
          <div v-for="item in uploads" :key="item.id" class="upload-item">
            <div>
              <strong>{{ item.file.name }}</strong>
              <ElSelect
                :model-value="item.targetId"
                :disabled="item.status !== 'queued'"
                clearable
                placeholder="未匹配，请选择稳定目标"
                @change="controller.assignUploadTarget(item.id, $event || null)"
                ><ElOption
                  v-for="target in targets"
                  :key="target.id"
                  :label="`${target.stableKey} · ${target.targetType}`"
                  :value="target.id" /></ElSelect
              ><small>{{ item.status }} · {{ item.progress }}%</small>
              <ElProgress :percentage="item.progress" :show-text="false" />
              <small v-if="item.error" class="upload-error">{{ item.error }}</small>
            </div>
            <ElButton v-if="item.status === 'queued'" link @click="controller.removeUpload(item.id)"
              >移出队列</ElButton
            >
            <ElButton
              v-if="item.status === 'uploading'"
              link
              @click="controller.cancelUpload(item.id)"
              >取消</ElButton
            >
            <ElButton
              v-else-if="['cancelled', 'failed'].includes(item.status)"
              link
              type="primary"
              @click="controller.startUpload(item.id)"
              >重试</ElButton
            >
          </div>
          <ElButton :disabled="busy || !selectedTarget" type="primary" @click="startUploads">
            开始上传音频
          </ElButton>
        </div>
      </AdminPanel>
      <AdminPanel :title="ADMIN_SECTION_TITLES.audioVersion.versions">
        <ElEmpty v-if="versions.length === 0 && state !== 'loading'" description="暂无候选版本" />
        <DataTable v-else :columns="ADMIN_TABLE_COLUMNS.audioVersions" :rows="versions">
          <template #actions="{ row }">
            <ElButton link @click="listen(row.id, row.assetId)">{{
              player?.label(row.id) ?? '试听'
            }}</ElButton>
            <ElButton
              v-if="row.status === 'CANDIDATE'"
              link
              type="primary"
              @click="confirmVersion(row.id)"
              >确认</ElButton
            >
            <ElButton
              v-if="row.id !== selectedTarget?.activeVersionId"
              link
              @click="rollbackVersion(row.id)"
              >回退</ElButton
            >
          </template>
        </DataTable>
      </AdminPanel>
    </div>
    <p aria-live="polite">{{ player?.statusText.value }} · {{ player?.error.value }}</p>
    <audio ref="audioElement" controls preload="metadata" />
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.audio-version-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;

    span {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }
  }

  .audio-grid {
    display: grid;
    grid-template-columns: minmax(0, 452fr) minmax(0, 690fr);
    gap: 14px;
    margin-top: 14px;
  }

  .el-select,
  .el-button {
    width: 100%;
  }

  .el-descriptions {
    margin-top: 14px;
  }

  .upload-queue {
    margin-top: 12px;
  }

  .upload-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

    div {
      flex: 1;
      min-width: 0;
    }

    strong,
    small {
      display: block;
    }

    small {
      margin-top: 3px;
      color: var(--juya-color-text-secondary);
    }

    .upload-error {
      color: var(--el-color-danger);
    }
  }

  @media (width <= 1100px) {
    .audio-grid {
      grid-template-columns: 1fr;
    }
  }
}

.audio-version-page :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.audio-grid > :deep(.el-card:first-child) {
  background: #eaf2e3;
}
</style>

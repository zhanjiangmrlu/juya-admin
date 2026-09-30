<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import { createAudioAdapter } from '@/features/audio/audio-adapter'
import { useAudioVersions } from '@/features/audio/use-audio-versions'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { UploadFile } from 'element-plus'

const route = useRoute()
const sceneId = computed(() => String(route.params.id))
const controller = useAudioVersions(createAudioAdapter(useAdminApiClient()), sceneId.value)
const { error, selectedTarget, state, targets, uploads, versions } = controller
const selectedTargetId = ref('')
const generation = reactive({ text: '', voice: 'standard' })
const busy = computed(() => state.value === 'loading' || state.value === 'saving')

onMounted(async () => {
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
  try {
    await controller.selectTarget(value)
  } catch {
    selectedTargetId.value = selectedTarget.value?.id ?? ''
  }
}

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

/** 创建当前目标的 TTS 候选任务。 */
async function generate(): Promise<void> {
  if (!generation.text.trim()) {
    ElMessage.warning('请输入需要生成的文本')
    return
  }
  try {
    const jobId = await controller.generate(generation.text, generation.voice)
    ElMessage.success(`TTS 任务已创建：${jobId}`)
  } catch {
    // The controller exposes the operation error.
  }
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
  <section v-loading="state === 'loading'" class="audio-version-page">
    <div class="page-heading">
      <div>
        <span>A21</span>
        <h2>音频版本管理 · {{ sceneId }}</h2>
      </div>
      <ElTag type="info">单批最多 300 个</ElTag>
    </div>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" show-icon />
    <div class="audio-grid">
      <ElCard shadow="never">
        <template #header><h3>音频目标</h3></template>
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
        <div v-if="uploads.length" class="upload-queue">
          <div v-for="item in uploads" :key="item.id" class="upload-item">
            <div>
              <strong>{{ item.file.name }}</strong>
              <small>{{ item.status }} · {{ item.progress }}%</small>
              <ElProgress :percentage="item.progress" :show-text="false" />
              <small v-if="item.error" class="upload-error">{{ item.error }}</small>
            </div>
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
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>音频版本</h3></template>
        <ElEmpty v-if="versions.length === 0 && state !== 'loading'" description="暂无候选版本" />
        <ElTable v-else :data="versions">
          <ElTableColumn label="版本" prop="versionNo" width="72" />
          <ElTableColumn label="来源" prop="source" width="96" />
          <ElTableColumn label="状态" prop="status" min-width="120" />
          <ElTableColumn label="素材编号" prop="assetId" min-width="150" />
          <ElTableColumn label="操作" width="170">
            <template #default="{ row }">
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
          </ElTableColumn>
        </ElTable>
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>生成候选音频</h3></template>
        <ElForm label-position="top">
          <ElFormItem label="音色"><ElInput v-model="generation.voice" /></ElFormItem>
          <ElFormItem label="文本">
            <ElInput v-model="generation.text" type="textarea" :rows="5" />
          </ElFormItem>
          <ElButton :disabled="busy || !selectedTarget" type="primary" @click="generate">
            创建 TTS 任务
          </ElButton>
        </ElForm>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
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
    grid-template-columns: minmax(260px, 1fr) minmax(440px, 2fr) minmax(260px, 1fr);
    gap: 14px;
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
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
</style>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import TaskProgress from '@/components/task-progress/task-progress.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import ContentMaterialsPanel from '@/features/content-import/content-materials-panel.vue'
import ContentPackageWorkflow from '@/features/content-import/content-package-workflow.vue'
import { validateImageBatch } from '@/features/content-import/import-validation'
import { createUploadAdapter } from '@/features/content-import/upload-adapter'
import { useUploadQueue } from '@/features/content-import/use-upload-queue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ContentSeries } from '@/features/content/content-adapter'
import type { UploadQueueItem } from '@/features/content-import/use-upload-queue'
import type { UploadFile, UploadFiles } from 'element-plus'

const context = reactive({ seriesId: '', templateId: '' })
const queue = useUploadQueue(createUploadAdapter(useAdminApiClient()))
const contextLocked = computed(() => queue.items.value.length > 0)
const duplicateCount = computed(
  () => queue.items.value.filter((item) => item.status === 'confirmed' && item.reusedScene).length
)
const router = useRouter()
const adapter = createContentAdapter(useAdminApiClient())
const series = ref<ContentSeries[]>([])
const /** 加载内容分类 */
  loadContext = async (): Promise<void> => {
    try {
      series.value = await adapter.listSeries()
    } catch {
      ElMessage.error('分类加载失败，请重试')
    }
  }
/** 编辑上传确认后自动建立的场景草稿。
 * @param item - 上传素材
 */
async function editImage(item: Readonly<UploadQueueItem>): Promise<void> {
  if (item.sceneId) await router.push({ name: 'content-scene-edit', params: { id: item.sceneId } })
}
const /**
   * 在内容列表中定位重复图片复用的场景
   * @param item - 已确认并返回场景编号的上传任务
   */
  viewExistingContent = async (item: Readonly<UploadQueueItem>): Promise<void> => {
    if (item.sceneId) {
      await router.push({ name: 'content-scenes', query: { scene_id: item.sceneId } })
    }
  }
onMounted(loadContext)

/**
 * 接收 Element Plus 选择的本地图片
 *
 * @param _file - 本次变化的上传文件
 * @param files - 当前选择的全部上传文件
 * @returns 无返回值
 */
function handleFiles(_file: UploadFile, files: UploadFiles): void {
  const batch = files.flatMap((candidate) =>
    candidate.raw
      ? [{ file: candidate.raw, seriesId: context.seriesId, templateId: context.templateId }]
      : []
  )
  const validation = validateImageBatch(batch)
  if (!validation.valid) {
    ElMessage.warning(validation.message)
    return
  }
  for (const item of batch) {
    if (!queue.items.value.some((queued) => queued.file.name === item.file.name))
      queue.add(item.file, { seriesId: item.seriesId, templateId: item.templateId })
  }
}
</script>

<template>
  <section class="content-import-page admin-brand-headings">
    <ContentPackageWorkflow />
    <ContentMaterialsPanel />
    <div class="page-heading">
      <div>
        <p class="page-description">
          批量图片上传建立场景草稿；同一系列和模板下的相同图片复用已有场景，图片仅作为可选材料，不提取文字。
        </p>
      </div>
    </div>
    <div class="content-grid">
      <AdminPanel :title="ADMIN_SECTION_TITLES.contentImport.uploadBatch">
        <ElAlert
          :closable="false"
          title="单批最多 30 张，且必须属于同一系列和模板"
          type="info"
          show-icon
        />
        <ElForm class="batch-form" label-position="top">
          <ElFormItem label="内容分类" required
            ><ElSelect v-model="context.seriesId" :disabled="contextLocked"
              ><ElOption
                v-for="item in series"
                :key="item.id"
                :label="item.title"
                :value="item.id" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="内容类型" required
            ><ElSelect v-model="context.templateId" :disabled="contextLocked"
              ><ElOption label="对话" value="dialogue" /><ElOption
                label="词汇"
                value="vocabulary" /></ElSelect
          ></ElFormItem>
        </ElForm>
        <ElUpload
          :auto-upload="false"
          :disabled="!context.seriesId || !context.templateId"
          :limit="30"
          accept="image/jpeg,image/png,image/webp"
          drag
          multiple
          @change="handleFiles"
        >
          <div class="upload-copy">
            <strong>拖拽图片到这里</strong><span>或点击选择 JPG、PNG、WebP 文件</span>
          </div>
        </ElUpload>
        <ElButton
          class="start-button"
          :disabled="queue.items.value.length === 0"
          type="primary"
          @click="queue.startAll"
          >开始上传</ElButton
        >
      </AdminPanel>

      <AdminPanel :title="ADMIN_SECTION_TITLES.contentImport.taskQueue">
        <ElEmpty v-if="queue.items.value.length === 0" description="尚未选择图片" />
        <template v-else>
          <ElAlert
            v-if="duplicateCount > 0"
            :title="`重复图片 ${duplicateCount} 张，已复用已有场景`"
            description="这些图片不会新增内容列表记录。点击「查看已有内容」可定位到对应场景。"
            type="warning"
            show-icon
            :closable="false"
          />
          <div v-for="item in queue.items.value" :key="item.id" class="queue-item">
            <TaskProgress :item="item" @cancel="queue.cancel" @retry="queue.start" />
            <ElButton
              v-if="item.sceneId && item.reusedScene"
              link
              type="primary"
              @click="viewExistingContent(item)"
              >查看已有内容</ElButton
            >
            <ElButton v-if="item.sceneId" link type="primary" @click="editImage(item)"
              >编辑场景草稿</ElButton
            >
          </div>
        </template>
        <ElAlert
          class="ocr-note"
          :closable="false"
          title="上传只确认素材。完整正文由管理员提供，保存草稿后另行校对发布。"
          type="success"
          show-icon
        />
      </AdminPanel>
    </div>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.content-import-page {
  .page-heading {
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

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
  }

  .batch-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 16px;
  }

  .upload-copy {
    display: grid;
    gap: 6px;
    color: var(--juya-color-text-secondary);
  }

  .start-button {
    width: 100%;
    margin-top: 16px;
  }

  .ocr-note {
    margin-top: 16px;
  }

  .queue-item {
    display: grid;
    gap: 6px;

    a {
      color: var(--el-color-primary);
      font-size: 12px;
      text-align: right;
    }
  }

  @media (width <= 1100px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }
}

.content-import-page :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.content-grid > :deep(.el-card:first-child) {
  background: #eaf2e3;
}

.page-description {
  margin: 0;
  color: var(--juya-color-text-regular);
  font-size: 13px;
}
</style>

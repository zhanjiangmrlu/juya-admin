<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ScenePreview from '@/features/content-editor/scene-preview.vue'
import ContentProductionNav from '@/features/content-production/content-production-nav.vue'
import { createPublishAdapter } from '@/features/publishing/publish-adapter'
import { publishCheckLabel } from '@/features/publishing/publish-check-labels'
import { useAdminPreview } from '@/features/publishing/use-admin-preview'
import { usePublishCheck } from '@/features/publishing/use-publish-check'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ProductionStage } from '@/features/content-production/content-production-model'

const route = useRoute()
const router = useRouter()
const revisionId = computed(() => String(route.params.id))
const adapter = createPublishAdapter(useAdminApiClient())
const controller = usePublishCheck(adapter, revisionId)
const previewController = useAdminPreview(adapter, revisionId)

onMounted(() => previewController.load().catch(() => undefined))

/**
 * 使用管理员预览的场景编号返回同一内容生产工作区。
 * @param stage - 选择的生产阶段
 */
async function selectStage(stage: ProductionStage): Promise<void> {
  if (stage === 'publish') return
  if (stage === 'list') {
    await router.push({ name: 'content-scenes' })
    return
  }
  const sceneId = previewController.preview.value?.sceneId
  if (!sceneId) {
    ElMessage.warning('缺少场景信息，请重新加载预览或返回内容列表选择场景')
    return
  }
  await router.push({ name: 'content-scene-edit', params: { id: sceneId }, query: { stage } })
}

/**
 * 执行发布检查并展示失败提示
 *
 * @returns 检查完成后的 Promise
 */
async function handleCheck(): Promise<void> {
  try {
    await controller.runCheck()
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '发布检查失败')
  }
}

/**
 * 发布已通过检查的内容版本
 *
 * @returns 发布完成后的 Promise
 */
async function handlePublish(): Promise<void> {
  try {
    await controller.publish()
    ElMessage.success('内容版本已发布')
  } catch {
    // 控制器负责提供可展示错误文案
  }
}
</script>

<template>
  <section class="publish-check-page admin-brand-headings">
    <ContentProductionNav active="publish" @select="selectStage" />
    <div class="page-heading">
      <div>
        <p>同一版本的文字、原图、音频与时间点整体切换 · {{ revisionId }}</p>
      </div>
      <ElButton type="primary" @click="handleCheck">运行发布检查</ElButton>
    </div>
    <div class="publish-grid">
      <AdminPanel
        :title="ADMIN_SECTION_TITLES.publishCheck.validationPanel"
        class="validation-panel"
      >
        <dl class="validation-list">
          <div
            v-for="label in [
              '中英文标题 · 完整原图 · 对话',
              '重点词汇 · Useful Chunks',
              '版权与素材来源',
              '整段音频及同版本引用',
              '全部句子的有效时间点'
            ]"
            :key="label"
          >
            <dt>{{ label }}</dt>
            <dd>
              {{
                !controller.result.value
                  ? '等待服务端检查'
                  : controller.result.value.errorCodes.length
                    ? '请核对下方检查结果'
                    : '通过'
              }}
            </dd>
          </div>
        </dl>
        <ElEmpty v-if="!controller.result.value" description="请先运行服务端发布检查" />
        <template v-else>
          <ElAlert
            v-for="code in controller.result.value.errorCodes"
            :key="code"
            class="check-item"
            :closable="false"
            :title="publishCheckLabel(code)"
            type="error"
            show-icon
          />
          <ElCheckbox
            v-for="code in controller.result.value.warningCodes"
            :key="code"
            class="warning-item"
            :model-value="controller.acknowledgedWarningCodes.value.includes(code)"
            @change="controller.setWarningAcknowledged(code, Boolean($event))"
            >确认警告：{{ code }}</ElCheckbox
          >
          <ElAlert
            v-if="
              controller.result.value.errorCodes.length === 0 &&
              controller.result.value.warningCodes.length === 0
            "
            :closable="false"
            type="success"
            title="发布检查通过"
            >确认后发布统一内容版本，已发布版本在确认前保持不变。</ElAlert
          >
        </template>
      </AdminPanel>
      <AdminPanel class="preview-panel">
        <template #header
          ><h3>管理员设备预览</h3>
          <p>手机 / 平板预览不产生学习进度</p></template
        >
        <ElSkeleton v-if="previewController.state.value === 'loading'" :rows="6" animated />
        <ElAlert
          v-else-if="previewController.error.value"
          :closable="false"
          :title="previewController.error.value"
          type="error"
          show-icon
        >
          <template #default
            ><ElButton link type="primary" @click="previewController.load"
              >重新加载预览</ElButton
            ></template
          >
        </ElAlert>
        <article v-else-if="previewController.preview.value" class="preview-card">
          <div class="preview-meta">
            <ElTag effect="plain">{{ previewController.preview.value.revisionStatus }}</ElTag
            ><span>{{ previewController.preview.value.seriesTitle }}</span>
          </div>
          <ScenePreview
            :content="previewController.preview.value.content"
            :revision-id="revisionId"
            :title="previewController.preview.value.sceneTitle"
          />
        </article>
        <ElAlert
          v-if="controller.error.value"
          class="publish-error"
          :closable="false"
          :title="controller.error.value"
          type="error"
          show-icon
        />
        <ElAlert class="permission-note" title="权限隔离" type="success" :closable="false">
          无权限预览只使用安全封面与专用片段。
        </ElAlert>
      </AdminPanel>
    </div>
    <div class="publish-actions">
      <ElButton @click="selectStage('audio')">返回音频标时</ElButton>
      <ElButton
        class="publish-button"
        :disabled="!controller.canPublish.value"
        type="primary"
        @click="handlePublish"
        >确认发布</ElButton
      >
    </div>
  </section>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.publish-check-page {
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

  .publish-grid {
    display: grid;
    grid-template-columns: minmax(0, 548fr) minmax(0, 594fr);
    align-items: start;
    gap: 18px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 20px;
  }

  .check-item,
  .warning-item {
    display: flex;
    margin-bottom: 10px;
  }

  .publish-error {
    margin-top: 14px;
  }

  .preview-card {
    min-width: 0;

    h4 {
      margin: 12px 0 6px;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }

    p {
      color: var(--juya-color-text-secondary);
    }

    pre {
      max-height: 300px;
      margin: 12px 0 0;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  .preview-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  @media (width <= 1000px) {
    .publish-grid {
      grid-template-columns: 1fr;
    }
  }
}

.publish-check-page :deep(.el-card__header) {
  padding: 18px 20px 0;
  border-bottom: 0;
}

.publish-check-page p {
  color: var(--juya-color-text-regular);
  font-size: 13px;
  line-height: 1.6;
}

.preview-panel {
  grid-column: 1;
  grid-row: 1;
  min-height: 600px;
  background: #eaf2e3;
}

.preview-panel :deep(.device-scroll) {
  max-height: 380px;
}

.validation-panel {
  grid-column: 2;
  min-height: 600px;
}

.validation-list {
  display: grid;
  gap: 32px;
  margin: 12px 0 32px;
}

.validation-list > div {
  padding-left: 14px;
  border-left: 5px solid var(--juya-color-success);
}

.validation-list dt {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
}

.validation-list dd {
  margin: 0;
  color: var(--juya-color-text-regular);
  font-size: 12px;
}

.permission-note {
  margin-top: 22px;
  padding: 16px;
  border-radius: 16px;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 28px;
}

.publish-actions :deep(.el-button) {
  min-width: 165px;
  height: 44px;
  margin-left: 0;
}

@media (width <= 1000px) {
  .preview-panel,
  .validation-panel {
    grid-column: auto;
    grid-row: auto;
  }

  .preview-panel {
    order: -1;
  }
}
</style>

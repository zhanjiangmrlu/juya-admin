<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { createPublishAdapter } from '@/features/publishing/publish-adapter'
import { useAdminPreview } from '@/features/publishing/use-admin-preview'
import { usePublishCheck } from '@/features/publishing/use-publish-check'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const route = useRoute()
const revisionId = computed(() => String(route.params.id))
const adapter = createPublishAdapter(useAdminApiClient())
const controller = usePublishCheck(adapter, revisionId)
const previewController = useAdminPreview(adapter, revisionId)

onMounted(() => previewController.load().catch(() => undefined))

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
  <section class="publish-check-page">
    <div class="page-heading">
      <div>
        <span>A22</span>
        <h2>发布检查与发布 · {{ revisionId }}</h2>
      </div>
      <ElButton type="primary" @click="handleCheck">运行发布检查</ElButton>
    </div>
    <div class="publish-grid">
      <ElCard shadow="never">
        <template #header><h3>检查结果</h3></template>
        <ElEmpty v-if="!controller.result.value" description="请先运行服务端发布检查" />
        <template v-else>
          <ElAlert
            v-for="code in controller.result.value.errorCodes"
            :key="code"
            class="check-item"
            :closable="false"
            :title="code"
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
          <ElResult
            v-if="
              controller.result.value.errorCodes.length === 0 &&
              controller.result.value.warningCodes.length === 0
            "
            icon="success"
            title="发布检查通过"
          />
        </template>
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>管理员预览与发布</h3></template>
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
          <h4>{{ previewController.preview.value.sceneTitle }}</h4>
          <p v-if="typeof previewController.preview.value.content.summary === 'string'">
            {{ previewController.preview.value.content.summary }}
          </p>
          <pre>{{ JSON.stringify(previewController.preview.value.content, null, 2) }}</pre>
        </article>
        <ElAlert
          v-if="controller.error.value"
          class="publish-error"
          :closable="false"
          :title="controller.error.value"
          type="error"
          show-icon
        />
        <ElButton
          class="publish-button"
          :disabled="!controller.canPublish.value"
          type="primary"
          @click="handlePublish"
          >确认发布</ElButton
        >
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
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
    grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
    gap: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .check-item,
  .warning-item {
    display: flex;
    margin-bottom: 10px;
  }

  .publish-error,
  .publish-button {
    width: 100%;
    margin-top: 14px;
  }

  .preview-card {
    padding: 14px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    background: var(--el-fill-color-lighter);

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
</style>

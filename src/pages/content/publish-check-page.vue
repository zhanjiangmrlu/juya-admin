<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { createPublishAdapter } from '@/features/publishing/publish-adapter'
import { usePublishCheck } from '@/features/publishing/use-publish-check'
import { createApiClient } from '@/services/api/api-client'

const route = useRoute()
const revisionId = computed(() => String(route.params.id))
const controller = usePublishCheck(createPublishAdapter(createApiClient()), revisionId)

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
        <ElAlert
          :closable="false"
          title="管理员预览接口待接入，不展示伪造预览内容"
          type="warning"
          show-icon
        />
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

  @media (width <= 1000px) {
    .publish-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

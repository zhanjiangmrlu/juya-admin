<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createOcrAdapter } from '@/features/ocr/ocr-adapter'
import { useOcrReview } from '@/features/ocr/use-ocr-review'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const route = useRoute()
const router = useRouter()
const taskId = computed(() => String(route.params.taskId))
const itemId = computed(() => String(route.params.itemId))
const sceneId = ref('')
const controller = useOcrReview(createOcrAdapter(useAdminApiClient()), taskId.value)
const { activeJobId, candidate, confirmation, contentText, error, job, state } = controller
const busy = computed(() => state.value === 'loading' || state.value === 'saving')

onMounted(() => void controller.load().catch(() => undefined))

/** 将当前人工 JSON 确认为场景草稿。 */
async function submitConfirmation(): Promise<void> {
  if (!sceneId.value.trim()) {
    ElMessage.warning('请输入要写入的场景编号')
    return
  }
  try {
    const result = await controller.confirm(sceneId.value.trim())
    ElMessage.success(`已创建人工草稿 ${result.revisionId}`)
  } catch {
    // The controller exposes the request error without clearing the edited JSON.
  }
}

/**
 * 执行 OCR 任务命令
 * @param operation - 取消或重试
 */
async function command(operation: 'cancel' | 'retry'): Promise<void> {
  try {
    const result = await controller.command(operation)
    if (result.id !== taskId.value) {
      await router.replace({
        name: route.name,
        params: { ...route.params, taskId: result.id },
        query: route.query
      })
    }
    ElMessage.success(operation === 'cancel' ? '任务已取消' : '重试任务已创建')
  } catch {
    // The controller keeps the current candidate visible on command failure.
  }
}
</script>

<template>
  <section v-loading="state === 'loading'" class="ocr-review-page">
    <div class="page-heading">
      <div>
        <span>A19</span>
        <h2>OCR 校对 · {{ activeJobId }} / {{ itemId }}</h2>
      </div>
      <div class="heading-actions">
        <ElButton :disabled="busy" @click="controller.load">刷新状态</ElButton>
        <ElButton
          v-if="job && ['PENDING', 'RUNNING'].includes(job.status)"
          :disabled="busy"
          @click="command('cancel')"
          >取消任务</ElButton
        >
        <ElButton
          v-if="job && ['FAILED', 'CANCELLED'].includes(job.status)"
          :disabled="busy"
          type="primary"
          @click="command('retry')"
          >重试任务</ElButton
        >
      </div>
    </div>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" show-icon />
    <ElAlert
      v-else-if="confirmation"
      :closable="false"
      :title="`人工版本已保存：${confirmation.revisionId} · ${confirmation.revisionStatus}`"
      type="success"
      show-icon
    />
    <div class="review-grid">
      <ElCard shadow="never">
        <template #header><h3>任务与原始素材</h3></template>
        <ElDescriptions v-if="job" :column="1" border>
          <ElDescriptionsItem label="状态"
            ><ElTag>{{ job.status }}</ElTag></ElDescriptionsItem
          >
          <ElDescriptionsItem label="素材编号">{{ job.targetId }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Provider Request">
            {{ job.providerRequestId ?? '尚未生成' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="job.errorCode" label="错误码">
            {{ job.errorCode }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <ElEmpty v-else-if="state !== 'loading'" description="任务不存在或暂不可用" />
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>OCR 候选</h3></template>
        <template v-if="candidate">
          <p>模板：{{ candidate.templateType }}</p>
          <p>平均置信度：{{ candidate.confidence ?? '未提供' }}</p>
          <pre>{{ JSON.stringify(candidate.content, null, 2) }}</pre>
        </template>
        <ElEmpty v-else-if="state !== 'loading'" description="候选尚未生成" />
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>人工版本</h3></template>
        <ElForm label-position="top">
          <ElFormItem label="场景编号" required>
            <ElInput v-model="sceneId" maxlength="64" />
          </ElFormItem>
          <ElFormItem label="校对后的结构化 JSON" required>
            <ElInput v-model="contentText" type="textarea" :rows="12" />
          </ElFormItem>
        </ElForm>
        <ElButton :disabled="busy || !candidate" type="primary" @click="submitConfirmation">
          保存人工版本
        </ElButton>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ocr-review-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
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

  .heading-actions {
    display: flex;
    gap: 8px;
  }

  .review-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  p {
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  pre {
    max-height: 280px;
    padding: 10px;
    overflow: auto;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    white-space: pre-wrap;
  }

  .el-button {
    width: 100%;
  }

  @media (width <= 1100px) {
    .review-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

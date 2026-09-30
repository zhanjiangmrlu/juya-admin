<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive } from 'vue'

import { createBatchJobAdapter } from '@/features/batch-jobs/batch-job-adapter'
import { validateBatchJobSize } from '@/features/batch-jobs/batch-job-model'
import { useBatchJobs } from '@/features/batch-jobs/use-batch-jobs'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const controller = useBatchJobs(createBatchJobAdapter(useAdminApiClient()))
const { error, jobs, page, pageSize, state, total, trash } = controller
const batchForm = reactive({ jobType: 'VALIDATE', targetIds: '' })
const trashForm = reactive({ revisionId: '', sceneId: '' })
const busy = computed(() => state.value === 'loading' || state.value === 'saving')

onMounted(() => void controller.load().catch(() => undefined))

/** 校验目标列表并创建通用批量任务。 */
async function createBatch(): Promise<void> {
  const targetIds = batchForm.targetIds
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  const validation = validateBatchJobSize(targetIds.length)
  if (!validation.valid) {
    ElMessage.warning(validation.message)
    return
  }
  try {
    await controller.create(batchForm.jobType, targetIds)
    batchForm.targetIds = ''
    ElMessage.success('批量任务已创建')
  } catch {
    // The controller exposes the operation error.
  }
}

/** 将指定草稿移入服务端回收站。 */
async function trashDraft(): Promise<void> {
  if (!trashForm.sceneId.trim() || !trashForm.revisionId.trim()) {
    ElMessage.warning('请输入场景和草稿版本编号')
    return
  }
  try {
    await controller.trashDraft(trashForm.sceneId.trim(), trashForm.revisionId.trim())
    trashForm.sceneId = ''
    trashForm.revisionId = ''
    ElMessage.success('草稿已移入回收站')
  } catch {
    // The controller exposes the operation error.
  }
}

/**
 * 执行批量任务命令并显示结果
 * @param batchId - 批量任务编号
 * @param operation - 取消或重试失败项
 */
async function commandBatch(batchId: string, operation: 'cancel' | 'retry-failed'): Promise<void> {
  try {
    await controller.command(batchId, operation)
    ElMessage.success(operation === 'cancel' ? '未完成项已取消' : '失败项重试任务已创建')
  } catch {
    // The controller exposes the operation error.
  }
}

/**
 * 执行草稿恢复或永久清理命令
 * @param entryId - 回收站记录编号
 * @param operation - 恢复或清理
 */
async function commandTrash(entryId: string, operation: 'cleanup' | 'restore'): Promise<void> {
  try {
    await controller.commandTrash(entryId, operation)
    ElMessage.success(operation === 'restore' ? '草稿已恢复' : '草稿已永久清理')
  } catch {
    // The controller exposes the operation error.
  }
}

/**
 * 判断回收站记录是否已超过最短保留期
 * @param retentionUntil - 服务端返回的保留期截止时间
 * @returns 是否允许永久清理
 */
function canCleanup(retentionUntil: string): boolean {
  return Date.now() >= Date.parse(retentionUntil)
}
</script>

<template>
  <section v-loading="state === 'loading'" class="batch-jobs-page">
    <div class="page-heading">
      <div>
        <span>A24</span>
        <h2>批量任务中心</h2>
      </div>
      <ElTag type="info">共 {{ total }} 个任务</ElTag>
    </div>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" show-icon />
    <div class="create-grid">
      <ElCard shadow="never">
        <template #header><h3>新建批量任务</h3></template>
        <ElForm label-position="top">
          <ElFormItem label="任务类型">
            <ElInput v-model="batchForm.jobType" maxlength="32" />
          </ElFormItem>
          <ElFormItem label="目标编号（逗号或换行分隔，最多 500 项）">
            <ElInput v-model="batchForm.targetIds" type="textarea" :rows="3" />
          </ElFormItem>
          <ElButton :disabled="busy" type="primary" @click="createBatch">创建任务</ElButton>
        </ElForm>
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>草稿移入回收站</h3></template>
        <ElForm label-position="top">
          <div class="trash-fields">
            <ElFormItem label="场景编号"><ElInput v-model="trashForm.sceneId" /></ElFormItem>
            <ElFormItem label="草稿版本编号">
              <ElInput v-model="trashForm.revisionId" />
            </ElFormItem>
          </div>
          <ElButton :disabled="busy" @click="trashDraft">移入回收站</ElButton>
        </ElForm>
      </ElCard>
    </div>
    <div class="job-grid">
      <ElCard shadow="never">
        <template #header><h3>执行中与历史任务</h3></template>
        <ElEmpty v-if="jobs.length === 0 && state !== 'loading'" description="暂无批量任务" />
        <ElCollapse v-else>
          <ElCollapseItem v-for="job in jobs" :key="job.id" :name="job.id">
            <template #title>
              <strong>{{ job.jobType }}</strong>
              <ElTag class="job-status">{{ job.status }}</ElTag>
              <span>{{ job.successCount }} 成功 / {{ job.failureCount }} 失败</span>
            </template>
            <ElTable :data="job.items" size="small">
              <ElTableColumn label="目标" prop="targetId" min-width="130" />
              <ElTableColumn label="状态" prop="status" width="120" />
              <ElTableColumn label="尝试" prop="attemptCount" width="72" />
              <ElTableColumn label="错误码" prop="errorCode" min-width="130" />
            </ElTable>
            <div class="job-actions">
              <ElButton
                v-if="['PENDING', 'RUNNING'].includes(job.status)"
                @click="commandBatch(job.id, 'cancel')"
                >取消未完成项</ElButton
              >
              <ElButton
                v-if="job.failureCount > 0"
                type="primary"
                @click="commandBatch(job.id, 'retry-failed')"
                >仅重试失败项</ElButton
              >
            </div>
          </ElCollapseItem>
        </ElCollapse>
        <ElPagination
          v-if="total > pageSize"
          background
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="controller.load"
        />
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>草稿回收站</h3></template>
        <ElEmpty v-if="trash.length === 0 && state !== 'loading'" description="回收站为空" />
        <div v-for="entry in trash" v-else :key="entry.id" class="trash-entry">
          <div>
            <strong>{{ entry.sceneId }}</strong>
            <p>{{ entry.revisionId }} · {{ entry.status }}</p>
            <small>保留至 {{ entry.retentionUntil }}</small>
          </div>
          <ElButton
            v-if="entry.status === 'TRASHED'"
            link
            type="primary"
            @click="commandTrash(entry.id, 'restore')"
            >恢复</ElButton
          >
          <ElButton
            v-if="entry.status === 'TRASHED'"
            :disabled="!canCleanup(entry.retentionUntil)"
            link
            type="danger"
            :title="canCleanup(entry.retentionUntil) ? '永久清理' : '保留期结束后可清理'"
            @click="commandTrash(entry.id, 'cleanup')"
            >永久清理</ElButton
          >
        </div>
        <p class="reference-note">被发布版本、活动或配置引用的草稿由服务端拒绝永久清理</p>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.batch-jobs-page {
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

  .create-grid,
  .job-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 14px;
    margin-top: 14px;
  }

  .trash-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 15px;
  }

  .job-status {
    margin: 0 10px;
  }

  .job-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }

  .el-pagination {
    justify-content: flex-end;
    margin-top: 14px;
  }

  .trash-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

    div {
      flex: 1;
      min-width: 0;
    }

    p,
    small {
      margin: 3px 0 0;
      color: var(--juya-color-text-secondary);
      font-size: 12px;
    }
  }

  .reference-note {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  @media (width <= 1000px) {
    .create-grid,
    .job-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

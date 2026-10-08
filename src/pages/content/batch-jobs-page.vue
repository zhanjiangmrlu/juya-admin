<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive } from 'vue'

import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { createBatchJobAdapter } from '@/features/batch-jobs/batch-job-adapter'
import { validateBatchJobSize } from '@/features/batch-jobs/batch-job-model'
import { useBatchJobs } from '@/features/batch-jobs/use-batch-jobs'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

const controller = useBatchJobs(createBatchJobAdapter(useAdminApiClient()))
const { error, jobs, page, pageSize, state, total, trash } = controller
const batchForm = reactive({
  jobType: 'VALIDATE',
  targetIds: '',
  tags: '',
  copyright: '',
  packageId: '',
  expectedVersions: ''
})
const jobTypes = {
  VALIDATE: '检查内容',
  PUBLISH: '发布',
  OFFLINE: '下线',
  RESTORE: '恢复草稿',
  EXPORT: '导出内容',
  TAGS: '设置标签',
  COPYRIGHT: '设置版权',
  PACKAGE: '加入内容包',
  OCR: '显式 OCR'
}
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
    const inputPayload: Record<string, unknown> = {}
    if (batchForm.jobType === 'TAGS')
      inputPayload.tags = batchForm.tags
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    if (batchForm.jobType === 'COPYRIGHT') inputPayload.copyright = batchForm.copyright
    if (batchForm.jobType === 'PACKAGE') inputPayload.package_id = batchForm.packageId.trim()
    if (batchForm.jobType === 'PUBLISH') {
      const versions = Object.fromEntries(
        batchForm.expectedVersions
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [id, version] = line.split(':')
            return [id?.trim(), Number(version)]
          })
      )
      if (targetIds.some((id) => !Number.isInteger(versions[id]) || versions[id] < 1))
        throw new Error('每个场景必须填写检查过的草稿版本')
      inputPayload.expected_versions = versions
    }
    await controller.create(batchForm.jobType, targetIds, inputPayload)
    batchForm.targetIds = ''
    ElMessage.success('批量任务已创建')
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '批量任务创建失败')
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
/** 下载批量任务实际结果。
 * @param id - 批量任务编号
 */
function exportResult(id: string): void {
  const job = jobs.value.find((item) => item.id === id)
  if (!job) return
  const url = globalThis.URL.createObjectURL(
    new globalThis.Blob(
      [JSON.stringify({ items: job.items, results: job.resultPayload }, null, 2)],
      {
        type: 'application/json'
      }
    )
  )
  const link = globalThis.document.createElement('a')
  link.href = url
  link.download = `batch-${id}.json`
  link.click()
  globalThis.URL.revokeObjectURL(url)
}
</script>

<template>
  <section v-loading="state === 'loading'" class="batch-jobs-page">
    <div class="page-heading">
      <div>
        <p class="page-description">单批图片最多 30 张；通用批量操作最多 500 个场景</p>
      </div>
      <div>
        <ElButton @click="controller.load()">刷新执行结果</ElButton
        ><ElTag type="info">共 {{ total }} 个任务</ElTag>
      </div>
    </div>
    <ElAlert v-if="error" :closable="false" :title="error" type="error" show-icon />
    <div class="create-grid">
      <ElCard shadow="never">
        <template #header><h3>新建批量任务</h3></template>
        <ElForm label-position="top">
          <ElFormItem label="任务类型">
            <ElSelect v-model="batchForm.jobType"
              ><ElOption
                v-for="(label, value) in jobTypes"
                :key="value"
                :label="label"
                :value="value"
            /></ElSelect>
          </ElFormItem>
          <ElFormItem label="目标编号（逗号或换行分隔，最多 500 项）">
            <ElInput v-model="batchForm.targetIds" type="textarea" :rows="3" />
          </ElFormItem>
          <ElFormItem v-if="batchForm.jobType === 'TAGS'" label="标签（逗号分隔）"
            ><ElInput v-model="batchForm.tags"
          /></ElFormItem>
          <ElFormItem v-if="batchForm.jobType === 'COPYRIGHT'" label="版权声明"
            ><ElInput v-model="batchForm.copyright" type="textarea"
          /></ElFormItem>
          <ElFormItem v-if="batchForm.jobType === 'PACKAGE'" label="内容包编号"
            ><ElInput v-model="batchForm.packageId"
          /></ElFormItem>
          <ElFormItem
            v-if="batchForm.jobType === 'PUBLISH'"
            label="草稿版本（每行 场景编号:版本号）"
            ><ElInput v-model="batchForm.expectedVersions" type="textarea" placeholder="SCENE-1:3"
          /></ElFormItem>
          <ElAlert
            v-if="batchForm.jobType === 'OCR'"
            :closable="false"
            title="将显式调用 OCR，使用服务器安全额度；结果需回到同一场景逐项采纳。"
            type="warning"
          />
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
        <template #header><h3>批量任务</h3></template>
        <ElEmpty v-if="jobs.length === 0 && state !== 'loading'" description="暂无批量任务" />
        <ElCollapse v-else>
          <ElCollapseItem v-for="job in jobs" :key="job.id" :name="job.id">
            <template #title>
              <span class="job-id">{{ job.id }}</span>
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
              <ElButton @click="exportResult(job.id)">下载执行结果</ElButton>
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
        <AppPagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :disabled="state === 'loading' || state === 'saving'"
          @change="controller.load"
        />
      </ElCard>
      <ElCard shadow="never">
        <template #header
          ><h3>草稿回收站</h3>
          <p class="reference-note">仅草稿可回收，保留 30 天；被引用草稿不可清理</p></template
        >
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
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.batch-jobs-page {
  display: flex;
  flex-direction: column;
  min-width: 0;

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
    gap: 20px;
    margin-top: 20px;
  }

  .create-grid {
    order: 2;
  }

  .job-grid {
    grid-template-columns: minmax(0, 1fr);
    order: 1;
    margin-top: 0;
  }

  .job-grid > :deep(.el-card:first-child) {
    min-height: 385px;
    background: #eaf2e3;
  }

  .job-grid > :deep(.el-card:last-child) {
    min-height: 268px;
  }

  :deep(.el-card__header) {
    padding: 18px 20px 0;
    border-bottom: 0;
  }

  :deep(.el-collapse) {
    overflow: hidden;
    border: 1px solid var(--juya-color-border-light);
    border-radius: 12px;
  }

  :deep(.el-collapse-item__header) {
    gap: 18px;
    min-height: 58px;
    padding: 0 16px;
    background: var(--juya-color-surface);
    font-size: 13px;
  }

  :deep(.el-collapse-item__title) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
    padding: 8px 0;
  }

  :deep(.el-collapse-item__wrap) {
    background: var(--juya-color-surface);
  }

  :deep(.el-collapse-item__content) {
    padding: 16px;
  }

  .job-id {
    min-width: 180px;
    overflow-wrap: anywhere;
  }

  .page-description {
    margin: 0;
    color: var(--juya-color-text-regular);
    font-size: 13px;
  }

  .trash-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 20px;
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

  .trash-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: var(--juya-color-surface);

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

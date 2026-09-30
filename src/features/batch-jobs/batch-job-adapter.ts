import type { BatchJob, BatchJobPage, TrashEntry } from './batch-job-model'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type BatchDto = components['schemas']['BatchJobResponse']
type BatchPageDto = components['schemas']['BatchJobPageResponse']
type TrashDto = components['schemas']['TrashEntryResponse']
type TrashListDto = components['schemas']['TrashListResponse']

export interface BatchJobAdapter {
  command(
    batchId: string,
    operation: 'cancel' | 'retry-failed',
    idempotencyKey: string
  ): Promise<BatchJob>
  commandTrash(
    entryId: string,
    operation: 'cleanup' | 'restore',
    idempotencyKey: string
  ): Promise<TrashEntry>
  create(jobType: string, targetIds: string[], idempotencyKey: string): Promise<BatchJob>
  list(page: number, pageSize: number, signal?: AbortSignal): Promise<BatchJobPage>
  listTrash(signal?: AbortSignal): Promise<TrashEntry[]>
  trash(sceneId: string, revisionId: string, idempotencyKey: string): Promise<TrashEntry>
}

/**
 * 创建批量任务和草稿回收站适配器
 *
 * @param client - 统一 API 客户端
 * @returns 批量任务适配器
 */
export function createBatchJobAdapter(client: ApiClient): BatchJobAdapter {
  return {
    async command(batchId, operation, idempotencyKey) {
      return mapBatch(
        await client.request<BatchDto>({
          body: {},
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/batch-jobs/${encodeURIComponent(batchId)}/commands/${operation}`
        })
      )
    },
    async commandTrash(entryId, operation, idempotencyKey) {
      return mapTrash(
        await client.request<TrashDto>({
          body: {},
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/trash/${encodeURIComponent(entryId)}/commands/${operation}`
        })
      )
    },
    async create(jobType, targetIds, idempotencyKey) {
      return mapBatch(
        await client.request<BatchDto>({
          body: { job_type: jobType, target_ids: targetIds },
          idempotencyKey,
          method: 'POST',
          path: '/api/v1/admin/media/batch-jobs'
        })
      )
    },
    async list(page, pageSize, signal) {
      const response = await client.request<BatchPageDto>({
        method: 'GET',
        path: '/api/v1/admin/media/batch-jobs',
        query: { page, page_size: pageSize },
        signal
      })
      return {
        items: response.items.map(mapBatch),
        page: response.page,
        pageSize: response.page_size,
        total: response.total
      }
    },
    async listTrash(signal) {
      const response = await client.request<TrashListDto>({
        method: 'GET',
        path: '/api/v1/admin/media/trash',
        signal
      })
      return response.items.map(mapTrash)
    },
    async trash(sceneId, revisionId, idempotencyKey) {
      return mapTrash(
        await client.request<TrashDto>({
          body: { revision_id: revisionId, scene_id: sceneId },
          idempotencyKey,
          method: 'POST',
          path: '/api/v1/admin/media/trash'
        })
      )
    }
  }
}

/**
 * 映射批量任务及其单项结果
 *
 * @param source - 服务端批量任务响应
 * @returns 页面批量任务模型
 */
function mapBatch(source: BatchDto): BatchJob {
  return {
    failureCount: source.failure_count,
    id: source.id,
    items: source.items.map((item) => ({
      attemptCount: item.attempt_count,
      errorCode: item.error_code,
      id: item.id,
      resultVersion: item.result_version,
      status: item.status,
      targetId: item.target_id
    })),
    jobType: source.job_type,
    status: source.status,
    successCount: source.success_count,
    totalCount: source.total_count,
    updatedAt: source.updated_at
  }
}

/**
 * 映射草稿回收站响应
 *
 * @param source - 服务端回收站响应
 * @returns 页面回收站记录
 */
function mapTrash(source: TrashDto): TrashEntry {
  return {
    id: source.id,
    retentionUntil: source.retention_until,
    revisionId: source.revision_id,
    sceneId: source.scene_id,
    status: source.status
  }
}

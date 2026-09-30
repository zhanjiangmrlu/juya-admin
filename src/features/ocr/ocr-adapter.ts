import type { OcrCandidate, OcrConfirmation, OcrJob } from './ocr-model'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type JobDto = components['schemas']['ProcessingJobResponse']
type CandidateDto = components['schemas']['OcrCandidateResponse']
type ConfirmationDto = components['schemas']['OcrConfirmationResponse']

export interface OcrAdapter {
  command(jobId: string, operation: 'cancel' | 'retry', idempotencyKey: string): Promise<OcrJob>
  confirm(
    jobId: string,
    sceneId: string,
    content: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<OcrConfirmation>
  getCandidate(jobId: string): Promise<OcrCandidate>
  getJob(jobId: string): Promise<OcrJob>
}

/**
 * 创建 OCR 任务与人工确认适配器
 *
 * @param client - 统一 API 客户端
 * @returns OCR 管理适配器
 */
export function createOcrAdapter(client: ApiClient): OcrAdapter {
  return {
    async command(jobId, operation, idempotencyKey) {
      const response = await client.request<JobDto>({
        body: {},
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/media/ocr/jobs/${encodeURIComponent(jobId)}/commands/${operation}`
      })
      return mapJob(response)
    },
    async confirm(jobId, sceneId, content, idempotencyKey) {
      const response = await client.request<ConfirmationDto>({
        body: { content, scene_id: sceneId },
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/media/ocr/jobs/${encodeURIComponent(jobId)}/commands/confirm`
      })
      return {
        revisionId: response.revision_id,
        revisionStatus: response.revision_status,
        version: response.version
      }
    },
    async getCandidate(jobId) {
      const response = await client.request<CandidateDto>({
        method: 'GET',
        path: `/api/v1/admin/media/ocr/jobs/${encodeURIComponent(jobId)}/candidate`
      })
      return {
        confidence: response.confidence,
        confirmedRevisionId: response.confirmed_revision_id,
        content: { ...response.structured_candidate },
        id: response.id,
        status: response.status,
        templateType: response.template_type
      }
    },
    async getJob(jobId) {
      return mapJob(
        await client.request<JobDto>({
          method: 'GET',
          path: `/api/v1/admin/media/ocr/jobs/${encodeURIComponent(jobId)}`
        })
      )
    }
  }
}

/**
 * 将任务 DTO 映射为页面模型
 *
 * @param source - 服务端任务响应
 * @returns OCR 任务模型
 */
function mapJob(source: JobDto): OcrJob {
  return {
    errorCode: source.error_code,
    id: source.id,
    providerRequestId: source.provider_request_id,
    status: source.status,
    targetId: source.target_id,
    updatedAt: source.updated_at
  }
}

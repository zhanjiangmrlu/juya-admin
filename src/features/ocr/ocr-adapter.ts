import { createIdempotencyKey } from '@/services/api/api-client'

import type { OcrCandidate, OcrJob } from './ocr-model'
import type { OcrSuggestions } from './ocr-suggestions'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type JobDto = components['schemas']['ProcessingJobResponse']
type CandidateDto = components['schemas']['OcrCandidateResponse']

export interface OcrAdapter {
  createJob(
    assetId: string,
    seriesId: string,
    sceneId: string,
    revisionId: string,
    idempotencyKey?: string,
    templateType?: 'dialogue' | 'vocabulary'
  ): Promise<OcrJob>
  getSuggestions(revisionId: string, jobId: string): Promise<OcrSuggestions>
  getQuota(): Promise<OcrQuota>
  updateSettings(
    input: {
      enabled: boolean
      monthly_limit: number
      free_quota: number
      paid_disabled: boolean
      verify_quota: boolean
    },
    idempotencyKey?: string
  ): Promise<OcrQuota>
  command(jobId: string, operation: 'cancel' | 'retry', idempotencyKey: string): Promise<OcrJob>
  getCandidate(jobId: string): Promise<OcrCandidate>
  getJob(jobId: string): Promise<OcrJob>
}

export interface OcrQuota {
  enabled: boolean
  monthly_limit: number
  month: string
  reserved_count: number
  remaining: number
  free_quota: number
  paid_disabled: boolean
  quota_verified_at: string | null
}

/**
 * 创建 OCR 任务与人工确认适配器
 *
 * @param client - 统一 API 客户端
 * @returns OCR 管理适配器
 */
export function createOcrAdapter(client: ApiClient): OcrAdapter {
  return {
    async createJob(
      assetId,
      seriesId,
      sceneId,
      revisionId,
      idempotencyKey = createIdempotencyKey(),
      templateType = 'dialogue'
    ) {
      return mapJob(
        await client.request<JobDto>({
          method: 'POST',
          path: '/api/v1/admin/media/ocr/jobs',
          body: {
            asset_id: assetId,
            series_id: seriesId,
            template_id: templateType,
            scene_id: sceneId,
            revision_id: revisionId
          },
          idempotencyKey
        })
      )
    },
    async getSuggestions(revisionId, jobId) {
      return client.request<OcrSuggestions>({
        method: 'GET',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/ocr-suggestions/${encodeURIComponent(jobId)}`
      })
    },
    async getQuota() {
      return client.request<OcrQuota>({ method: 'GET', path: '/api/v1/admin/media/ocr/quota' })
    },
    async updateSettings(input, idempotencyKey = createIdempotencyKey()) {
      return client.request<OcrQuota>({
        method: 'PUT',
        path: '/api/v1/admin/media/ocr/settings',
        idempotencyKey,
        body: input
      })
    },
    async command(jobId, operation, idempotencyKey) {
      const response = await client.request<JobDto>({
        body: {},
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/media/ocr/jobs/${encodeURIComponent(jobId)}/commands/${operation}`
      })
      return mapJob(response)
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

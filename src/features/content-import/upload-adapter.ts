import { hashFile } from '@/services/upload/hash-file'
import { createXhrUploader } from '@/services/upload/xhr-uploader'

import type { UploadAdapter, UploadPreparation } from './use-upload-queue'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type ProcessingJobDto = components['schemas']['ProcessingJobResponse']

/**
 * 创建图片上传策略、直传和确认适配器
 *
 * @param client - 统一 API 客户端
 * @returns 上传队列适配器
 */
export function createUploadAdapter(client: ApiClient): UploadAdapter {
  const uploader = createXhrUploader()
  return {
    /**
     * 确认已成功写入对象存储的图片
     *
     * @param prepared - 已准备的对象键和上传字段
     * @param context - 加入队列时冻结的业务上下文
     * @param idempotencyKey - OCR 任务逻辑操作幂等键
     * @returns 确认完成后的 Promise
     */
    async confirm(prepared, context, idempotencyKey) {
      const asset = await client.request<{ id: string }>({
        body: { asset_type: 'images', object_key: prepared.objectKey },
        method: 'POST',
        path: '/api/v1/admin/media/uploads/confirm'
      })
      const job = await client.request<ProcessingJobDto>({
        body: {
          asset_id: asset.id,
          object_key: prepared.objectKey,
          series_id: context.seriesId,
          template_id: context.templateId
        },
        idempotencyKey,
        method: 'POST',
        path: '/api/v1/admin/media/ocr/jobs'
      })
      return { assetId: asset.id, jobId: job.id }
    },
    /**
     * 计算摘要并申请图片上传临时策略
     *
     * @param file - 待上传图片
     * @returns 对象存储上传准备信息
     */
    async prepare(file) {
      const sha256 = await hashFile(file)
      const policy = await client.request<Record<string, unknown>>({
        body: { asset_type: 'images' },
        method: 'POST',
        path: '/api/v1/admin/media/upload-policies'
      })
      return parsePolicy(policy, file, sha256)
    },
    /**
     * 使用临时策略直传图片
     *
     * @param prepared - 对象存储上传准备信息
     * @param file - 待上传图片
     * @param onProgress - 进度回调
     * @param signal - 取消信号
     * @returns 上传完成后的 Promise
     */
    async upload(prepared, file, onProgress, signal) {
      await uploader.upload({ ...prepared, file, onProgress, signal })
    }
  }
}

/**
 * 校验并映射上传策略响应
 *
 * @param source - 服务端上传策略响应
 * @param file - 当前图片文件
 * @param sha256 - 文件摘要
 * @returns 对象存储上传准备信息
 */
function parsePolicy(
  source: Record<string, unknown>,
  file: File,
  sha256: string
): UploadPreparation {
  if (typeof source.upload_url !== 'string' || !isStringRecord(source.fields))
    throw new Error('上传策略响应格式不正确')
  const fields = { ...source.fields }
  const keyTemplate = fields.key
  if (!keyTemplate) throw new Error('上传策略缺少对象键')
  const objectKey = keyTemplate.replace('${filename}', file.name)
  return {
    fields: { ...fields, key: objectKey, 'x-oss-meta-sha256': sha256 },
    objectKey,
    url: source.upload_url
  }
}

/**
 * 判断未知值是否为字符串记录
 *
 * @param value - 需要判断的未知值
 * @returns 是否为字符串记录
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

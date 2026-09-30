import { hashFile } from '@/services/upload/hash-file'
import { createXhrUploader } from '@/services/upload/xhr-uploader'

import type { AudioTarget, AudioVersion } from './audio-version-model'
import type { ApiClient } from '@/services/api/api-client'
import type { XhrUploader } from '@/services/upload/xhr-uploader'
import type { components } from '@/shared/contracts/generated/admin-api'

type TargetDto = components['schemas']['AudioTargetResponse']
type TargetListDto = components['schemas']['AudioTargetListResponse']
type VersionDto = components['schemas']['AudioVersionResponse']
type VersionListDto = components['schemas']['AudioVersionListResponse']

export interface AudioAdapter {
  confirmVersion(versionId: string, idempotencyKey: string): Promise<AudioTarget>
  generate(
    targetId: string,
    input: { stableKey: string; targetType: string; text: string; voice: string },
    idempotencyKey: string
  ): Promise<string>
  listTargets(sceneId: string, signal?: AbortSignal): Promise<AudioTarget[]>
  listVersions(targetId: string, signal?: AbortSignal): Promise<AudioVersion[]>
  rollback(targetId: string, versionId: string, idempotencyKey: string): Promise<AudioTarget>
  uploadFile(
    targetId: string,
    file: File,
    idempotencyKey: string,
    onProgress: (progress: number) => void,
    signal: AbortSignal
  ): Promise<AudioVersion>
  uploadVersion(targetId: string, assetId: string, idempotencyKey: string): Promise<AudioVersion>
}

export interface AudioUploadDependencies {
  hash?: typeof hashFile
  uploader?: XhrUploader
}

/**
 * 创建音频目标和版本适配器
 *
 * @param client - 统一 API 客户端
 * @param dependencies - 可替换的摘要和直传实现
 * @returns 音频版本适配器
 */
export function createAudioAdapter(
  client: ApiClient,
  dependencies: AudioUploadDependencies = {}
): AudioAdapter {
  const hash = dependencies.hash ?? hashFile
  const uploader = dependencies.uploader ?? createXhrUploader()
  return {
    async confirmVersion(versionId, idempotencyKey) {
      return mapTarget(
        await client.request<TargetDto>({
          body: {},
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/audio-versions/${encodeURIComponent(versionId)}/commands/confirm`
        })
      )
    },
    async generate(targetId, input, idempotencyKey) {
      const response = await client.request<components['schemas']['ProcessingJobResponse']>({
        body: {
          stable_key: input.stableKey,
          target_type: input.targetType,
          text: input.text,
          voice: input.voice
        },
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/media/audio-targets/${encodeURIComponent(targetId)}/commands/generate`
      })
      return response.id
    },
    async listTargets(sceneId, signal) {
      const response = await client.request<TargetListDto>({
        method: 'GET',
        path: '/api/v1/admin/media/audio-targets',
        query: { scene_id: sceneId },
        signal
      })
      return response.items.map(mapTarget)
    },
    async listVersions(targetId, signal) {
      const response = await client.request<VersionListDto>({
        method: 'GET',
        path: `/api/v1/admin/media/audio-targets/${encodeURIComponent(targetId)}/versions`,
        signal
      })
      return response.items.map(mapVersion)
    },
    async rollback(targetId, versionId, idempotencyKey) {
      return mapTarget(
        await client.request<TargetDto>({
          body: { version_id: versionId },
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/audio-targets/${encodeURIComponent(targetId)}/commands/rollback`
        })
      )
    },
    async uploadFile(targetId, file, idempotencyKey, onProgress, signal) {
      const sha256 = await hash(file)
      const policy = await client.request<Record<string, unknown>>({
        body: { asset_type: 'audio' },
        method: 'POST',
        path: '/api/v1/admin/media/upload-policies',
        signal
      })
      const prepared = parseUploadPolicy(policy, file, sha256)
      await uploader.upload({ ...prepared, file, onProgress, signal })
      const asset = await client.request<{ id: string }>({
        body: { asset_type: 'audio', object_key: prepared.objectKey },
        method: 'POST',
        path: '/api/v1/admin/media/uploads/confirm',
        signal
      })
      return mapVersion(
        await client.request<VersionDto>({
          body: { asset_id: asset.id },
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/audio-targets/${encodeURIComponent(targetId)}/versions`,
          signal
        })
      )
    },
    async uploadVersion(targetId, assetId, idempotencyKey) {
      return mapVersion(
        await client.request<VersionDto>({
          body: { asset_id: assetId },
          idempotencyKey,
          method: 'POST',
          path: `/api/v1/admin/media/audio-targets/${encodeURIComponent(targetId)}/versions`
        })
      )
    }
  }
}

/**
 * 将上传策略映射成直传所需字段
 *
 * @param source - 上传策略响应
 * @param file - 待上传音频
 * @param sha256 - 文件摘要
 * @returns 直传地址、字段和最终对象键
 */
function parseUploadPolicy(
  source: Record<string, unknown>,
  file: File,
  sha256: string
): { fields: Record<string, string>; objectKey: string; url: string } {
  if (typeof source.upload_url !== 'string' || !isStringRecord(source.fields))
    throw new Error('上传策略响应格式不正确')
  const keyTemplate = source.fields.key
  if (!keyTemplate) throw new Error('上传策略缺少对象键')
  const objectKey = keyTemplate.replace('${filename}', file.name)
  return {
    fields: { ...source.fields, key: objectKey, 'x-oss-meta-sha256': sha256 },
    objectKey,
    url: source.upload_url
  }
}

/**
 * 判断未知值是否为字符串记录
 * @param value - 待判断值
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

/**
 * 映射音频目标响应
 *
 * @param source - 服务端目标响应
 * @returns 页面音频目标
 */
function mapTarget(source: TargetDto): AudioTarget {
  return {
    activeVersionId: source.active_version_id,
    id: source.id,
    stableKey: source.stable_key,
    targetType: source.target_type
  }
}

/**
 * 映射音频版本响应
 *
 * @param source - 服务端版本响应
 * @returns 页面音频版本
 */
function mapVersion(source: VersionDto): AudioVersion {
  return {
    assetId: source.asset_id,
    createdAt: source.created_at,
    id: source.id,
    source: source.source,
    status: source.status,
    targetId: source.target_id,
    versionNo: source.version_no
  }
}

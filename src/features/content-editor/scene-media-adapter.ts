import { hashFile } from '@/services/upload/hash-file'
import { createXhrUploader } from '@/services/upload/xhr-uploader'

import type { ApiClient } from '@/services/api/api-client'

export interface AssetMetadata {
  id: string
  duration_ms: number | null
  width: number | null
  height: number | null
  security_status: string
  status: string
}

/** 提供场景素材上传、元数据和管理员签名。
 * @param client - 管理员 API
 * @returns 场景素材适配器
 */
export function createSceneMediaAdapter(client: ApiClient) {
  const uploader = createXhrUploader()
  return {
    async uploadImage(file: File) {
      const sha256 = await hashFile(file)
      const policy = await client.request<{ upload_url: string; fields: Record<string, string> }>({
        method: 'POST',
        path: '/api/v1/admin/media/upload-policies',
        body: { asset_type: 'images' }
      })
      const objectKey = policy.fields.key?.replace('${filename}', file.name)
      if (!objectKey) throw new Error('上传策略缺少对象键')
      await uploader.upload({
        fields: { ...policy.fields, key: objectKey, 'x-oss-meta-sha256': sha256 },
        url: policy.upload_url,
        file,
        onProgress: () => undefined,
        signal: new AbortController().signal
      })
      return client.request<AssetMetadata>({
        method: 'POST',
        path: '/api/v1/admin/media/uploads/confirm',
        body: { asset_type: 'images', object_key: objectKey }
      })
    },
    async metadata(assetId: string) {
      return client.request<AssetMetadata>({
        method: 'GET',
        path: `/api/v1/admin/media/assets/${encodeURIComponent(assetId)}`
      })
    },
    async signedUrl(assetId: string) {
      return client.request<{ url: string; expires_at: string }>({
        method: 'GET',
        path: `/api/v1/admin/media/assets/${encodeURIComponent(assetId)}/signed-url`
      })
    },
    async createEntryAudioTarget(entryId: string, entryType: 'vocabulary' | 'chunk') {
      return client.request<{
        id: string
        stable_key: string
        target_type: string
        active_version_id: string | null
      }>({
        method: 'POST',
        path: '/api/v1/admin/media/audio-targets',
        idempotencyKey: `lexicon-audio-${entryId}`,
        body: { stable_key: entryId, target_type: entryType }
      })
    },
    async createSceneAudioTarget(sceneId: string) {
      return client.request<{
        id: string
        stable_key: string
        target_type: string
        active_version_id: string | null
      }>({
        method: 'POST',
        path: '/api/v1/admin/media/audio-targets',
        idempotencyKey: `scene-audio-${sceneId}`,
        body: { stable_key: sceneId, target_type: 'scene' }
      })
    }
  }
}

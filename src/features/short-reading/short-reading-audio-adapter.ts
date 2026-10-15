import { createAudioAdapter } from '@/features/audio/audio-adapter'

import type { ShortReadingSnapshot } from './short-reading-model'
import type { AudioAdapter } from '@/features/audio/audio-adapter'
import type { AudioVersion } from '@/features/audio/audio-version-model'
import type { ApiClient } from '@/services/api/api-client'

/**
 * 复用媒体直传，把可解码音频绑定到独立短文固定草稿 FULL 目标
 * @param client - 当前管理员客户端
 * @param audio - 可替换的既有音频直传实现
 * @returns 固定角色上传和绑定命令
 */
export const createShortReadingAudioAdapter = (
  client: ApiClient,
  audio: Pick<AudioAdapter, 'uploadFile'> = createAudioAdapter(client)
) => {
  const completed = new WeakMap<File, Map<string, AudioVersion>>()
  return {
    /**
     * 上传成功阶段复用；绑定由服务端校验审核、解码和双版本
     * @param snapshot - 已保存全部输入的固定短文草稿
     * @param file - 管理员选择的完整音频
     * @param key - 同一文件和版本的重试身份
     * @param progress - 实际文件传输进度
     * @param signal - 离页取消信号
     * @returns 服务端绑定回执
     */ upload: async (
      snapshot: ShortReadingSnapshot,
      file: File,
      key: string,
      progress: (value: number) => void = () => undefined,
      signal: AbortSignal = new AbortController().signal
    ): Promise<void> => {
      const base = `/api/v1/admin/content/short-readings/${encodeURIComponent(snapshot.id)}/revisions/${encodeURIComponent(snapshot.revisionId)}/audio-upload-target`
      const expected = {
        expected_version: snapshot.version,
        expected_edit_version: snapshot.editVersion
      }
      const target = await client.request<{
        id: string
        content_id: string
        revision_id: string
        target_type: string
      }>({
        method: 'POST',
        path: base,
        headers: { 'Idempotency-Key': `${key}:target` },
        body: expected,
        signal
      })
      if (
        !target.id ||
        target.target_type !== 'FULL' ||
        target.content_id !== snapshot.id ||
        target.revision_id !== snapshot.revisionId
      )
        throw new Error('短文上传目标不属于当前草稿 FULL 角色')
      const signature = JSON.stringify([
        snapshot.id,
        snapshot.revisionId,
        snapshot.version,
        snapshot.editVersion,
        target.id,
        key
      ])
      let versions = completed.get(file)
      if (!versions) {
        versions = new Map()
        completed.set(file, versions)
      }
      let uploaded = versions.get(signature)
      if (!uploaded) {
        uploaded = await audio.uploadFile(target.id, file, `${key}:file`, progress, signal)
        if (uploaded.targetId !== target.id || !uploaded.assetId)
          throw new Error('上传音频版本不属于当前短文目标')
        versions.set(signature, uploaded)
      }
      await client.request({
        method: 'POST',
        path: `${base}/bind`,
        headers: { 'Idempotency-Key': `${key}:bind` },
        body: { ...expected, target_id: target.id, asset_id: uploaded.assetId },
        signal
      })
    }
  }
}

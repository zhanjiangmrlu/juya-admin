import { createContentAdapter } from '@/features/content/content-adapter'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'
import { ApiError } from '@/shared/errors/api-error'

import type { SentenceSliceAdapter } from './sentence-slice-model'
import type { ApiClient } from '@/services/api/api-client'

const base = '/api/v1/admin/content/revisions'
export const /**
   * 接入真实边界确认、异步切片预览和人工听音确认
   * @param client - 当前认证管理客户端
   * @returns 固定版本切片适配器
   */ createSentenceSliceAdapter = (client: ApiClient): SentenceSliceAdapter => {
    const content = createContentAdapter(client)
    const dependencies = new Map<string, string>()
    return {
      available: hasAdminOperation(
        `${base}/{revision_id}/sentences/{sentence_id}/slice-preview`,
        'get'
      ),
      /**
       * 按当前服务端边界读取实际切片，未完成不伪装文件
       * @param revisionId - 当前固定修订编号
       * @returns 实际切片或等待状态
       */ list: async (revisionId) => {
        const revision = await content.getRevision(revisionId)
        const form = normalizeSceneContent(revision.content)
        return Promise.all(
          form.dialogue.map(async (row) => {
            let dependencyHash =
              row.slice_dependency_hash || dependencies.get(`${revisionId}:${row.id}`)
            let state: Record<string, unknown> | null = null
            if (
              hasAdminOperation(`${base}/{revision_id}/sentences/{sentence_id}/slice-state`, 'get')
            ) {
              state = await client.request<Record<string, unknown>>({
                method: 'GET',
                path: `${base}/${encodeURIComponent(revisionId)}/sentences/${encodeURIComponent(row.id)}/slice-state`,
                query: { expected_version: revision.version }
              })
              if (
                state.revision_id !== revisionId ||
                state.sentence_id !== row.id ||
                state.edit_version !== revision.version
              )
                throw new Error('切片状态不属于当前句子与草稿版本，请重新加载')
              dependencyHash =
                typeof state.dependency_hash === 'string' ? state.dependency_hash : undefined
            }
            const slice = {
              sentenceId: row.id,
              sourceVersion: form.audio?.version_id || '',
              startMs: row.start_ms ?? 0,
              endMs: row.end_ms ?? 0,
              status: String(state?.status || 'PENDING'),
              targetId: typeof state?.target_id === 'string' ? state.target_id : null,
              resourceVersion:
                typeof state?.resource_version === 'string' ? state.resource_version : null,
              assetId: typeof state?.asset_id === 'string' ? state.asset_id : null,
              durationMs: Number(state?.duration_ms || 0),
              confirmed: state?.listening_confirmed === true,
              errorCode: typeof state?.error_code === 'string' ? state.error_code : undefined,
              dependencyHash
            }
            if (!dependencyHash) return slice
            if (state && !['READY_TO_LISTEN', 'CONFIRMED'].includes(slice.status)) return slice
            try {
              const result = await client.request<{
                url: string
                target_id: string
                resource_version: string
                asset_id: string
                duration_ms: number
                status: string
                dependency_hash: string
              }>({
                method: 'GET',
                path: `${base}/${encodeURIComponent(revisionId)}/sentences/${encodeURIComponent(row.id)}/slice-preview`,
                query: { dependency_hash: dependencyHash }
              })
              if (result.dependency_hash !== dependencyHash)
                throw new Error('切片依赖响应已变化，请重新标记边界')
              if (
                state &&
                (result.resource_version !== slice.resourceVersion ||
                  result.asset_id !== slice.assetId ||
                  result.target_id !== slice.targetId)
              )
                throw new Error('切片文件在读取期间已变化，请刷新后重新试听')
              return {
                ...slice,
                status: result.status,
                targetId: result.target_id,
                resourceVersion: result.resource_version,
                assetId: result.asset_id,
                durationMs: result.duration_ms,
                confirmed: result.status === 'CONFIRMED',
                url: result.url
              }
            } catch (failure) {
              if (failure instanceof ApiError && failure.code === 'SLICE_NOT_READY') return slice
              throw failure
            }
          })
        )
      },
      /**
       * 只确认当前句子边界并排队生成实际文件
       * @param revisionId - 当前修订
       * @param expectedVersion - 当前编辑版本
       * @param sourceVersion - 管理员正在核对的源音频版本
       * @param row - 人工调整的单句边界
       * @param key - 当前边界命令身份
       * @returns 更新后的完整草稿
       */ recut: async (revisionId, expectedVersion, sourceVersion, row, key) => {
        const revision = await content.getRevision(revisionId)
        if (normalizeSceneContent(revision.content).audio?.version_id !== sourceVersion)
          throw new Error('整段音频已变化，请重新读取草稿')
        const result = await client.request<{ dependency_hash: string }>({
          method: 'POST',
          path: `${base}/${encodeURIComponent(revisionId)}/sentences/${encodeURIComponent(row.id)}/boundary-confirm`,
          headers: { 'Idempotency-Key': key },
          body: {
            expected_version: expectedVersion,
            manual_checked: true,
            start_ms: row.start_ms,
            end_ms: row.end_ms
          }
        })
        dependencies.set(`${revisionId}:${row.id}`, result.dependency_hash)
        return content.getRevision(revisionId)
      },
      /**
       * 人工试听当前实际文件后绑定同一依赖哈希
       * @param revisionId - 固定草稿编号
       * @param expectedVersion - 当前草稿编辑版本
       * @param slice - 已试听的实际独立文件
       * @param key - 当前确认命令身份
       * @returns 已绑定切片的完整草稿
       */ confirm: async (revisionId, expectedVersion, slice, key) => {
        if (!slice.dependencyHash || !slice.assetId || !slice.resourceVersion)
          throw new Error('当前句子尚无可确认的实际切片')
        await client.request({
          method: 'POST',
          path: `${base}/${encodeURIComponent(revisionId)}/sentences/${encodeURIComponent(slice.sentenceId)}/slice-confirm`,
          headers: { 'Idempotency-Key': key },
          body: {
            expected_version: expectedVersion,
            dependency_hash: slice.dependencyHash,
            listened: true
          }
        })
        return content.getRevision(revisionId)
      }
    }
  }

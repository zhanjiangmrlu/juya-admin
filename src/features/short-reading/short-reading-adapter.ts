import { createIdempotencyKey } from '@/services/api/api-client'
import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

import { createShortReadingAudioAdapter } from './short-reading-audio-adapter'
import {
  normalizeShortReading,
  type ShortReadingAdapter,
  type ShortReadingSnapshot
} from './short-reading-model'

const base = '/api/v1/admin/content/short-readings'
export const /**
   * 消费实际 short_reading router 的独立版本与幂等命令
   * @param client - 当前认证管理客户端
   * @returns 纯阅读内容适配器
   */ createShortReadingAdapter = (client: ApiClient): ShortReadingAdapter => {
    const snapshots = new Map<string, ShortReadingSnapshot>()
    const offlineKeys = new Map<string, string>()
    const trialKeys = new Map<string, string>()
    const audioUploads = createShortReadingAudioAdapter(client)
    const /**
       * 读取独立内容及当前草稿或发布快照
       * @param id - 短文稳定编号
       * @returns 带内容版本和编辑版本的快照
       */ load = async (id: string): Promise<ShortReadingSnapshot> => {
        const row = await client.request<Record<string, unknown>>({
          method: 'GET',
          path: `${base}/${encodeURIComponent(id)}`
        })
        const revisionId = String(row.draft_revision_id ?? row.published_revision_id ?? '')
        if (!revisionId) throw new Error('短文尚无可读取版本')
        const revision = await client.request<Record<string, unknown>>({
          method: 'GET',
          path: `${base}/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}`
        })
        const raw = revision.content_snapshot
        if (
          !raw ||
          typeof raw !== 'object' ||
          !Number.isInteger(row.version) ||
          !Number.isInteger(revision.edit_version)
        )
          throw new Error('短文版本响应不完整')
        const result: ShortReadingSnapshot = {
          id,
          revisionId,
          version: Number(row.version),
          editVersion: Number(revision.edit_version),
          contentHash: String(revision.content_hash ?? ''),
          seriesId: String(row.series_id ?? ''),
          status: String(revision.status ?? row.status),
          content: normalizeShortReading(raw as Record<string, unknown>),
          trialEnabled: typeof row.trial_enabled === 'boolean' ? row.trial_enabled : null,
          trialVersion: Number(row.version),
          sortOrder: Number.isInteger(row.sort_order) ? Number(row.sort_order) : null
        }
        snapshots.set(revisionId, result)
        return result
      }
    const /**
       * 定位已读取的修订，禁止把编辑版本当内容版本
       * @param revisionId - 当前已读取修订编号
       * @returns 已读取短文快照
       */ snapshotFor = (revisionId: string): ShortReadingSnapshot => {
        const snapshot = snapshots.get(revisionId)
        if (!snapshot) throw new Error('请重新读取当前短文版本')
        return snapshot
      }
    return {
      available: hasAdminOperation(base, 'post'),
      audioAvailable: hasAdminOperation(
        `${base}/{identity}/revisions/{revision_id}/audio-upload-target`,
        'post'
      ),
      sortAvailable: hasAdminOperation(`${base}/{identity}/sort-order`, 'post'),
      load,
      /**
       * 下线固定内容版本，失败重试复用同一身份并保留历史引用
       * @param snapshot - 管理员已读取的当前短文内容版本
       */ offline: async (snapshot): Promise<void> => {
        const signature = `${snapshot.id}:${snapshot.version}`
        if (!offlineKeys.has(signature)) offlineKeys.set(signature, createIdempotencyKey())
        await client.request({
          method: 'POST',
          path: `${base}/${encodeURIComponent(snapshot.id)}/offline`,
          headers: { 'Idempotency-Key': offlineKeys.get(signature)! },
          body: { expected_version: snapshot.version }
        })
      },
      /**
       * 创建独立纯阅读草稿
       * @param seriesId - 管理员选择的分类编号
       * @param content - 完整纯阅读字段
       * @param key - 同一创建动作复用的命令键
       * @returns 服务端保存后的草稿
       */ create: async (seriesId, content, key) => {
        const result = await client.request<{ content_id: string }>({
          method: 'POST',
          path: base,
          headers: { 'Idempotency-Key': key },
          body: { series_id: seriesId, content }
        })
        return load(result.content_id)
      },
      /**
       * 保存内容与编辑双版本守卫的完整草稿
       * @param snapshot - 当前固定内容与编辑版本
       * @param content - 当前全部纯阅读输入
       * @param key - 失败重试复用的保存身份
       * @returns 保存后的服务端草稿
       */ save: async (snapshot, content, key) => {
        await client.request({
          method: 'PUT',
          path: `${base}/${encodeURIComponent(snapshot.id)}/revisions/${encodeURIComponent(snapshot.revisionId)}`,
          headers: { 'Idempotency-Key': key },
          body: {
            expected_version: snapshot.version,
            expected_edit_version: snapshot.editVersion,
            content
          }
        })
        return load(snapshot.id)
      },
      /**
       * 从当前已发布修订建立独立候选
       * @param snapshot - 当前内容版本
       * @param key - 创建候选的固定命令键
       * @returns 当前新草稿
       */ createRevision: async (snapshot, key) => {
        await client.request({
          method: 'POST',
          path: `${base}/${encodeURIComponent(snapshot.id)}/revisions`,
          headers: { 'Idempotency-Key': key },
          body: { expected_version: snapshot.version, source_revision_id: snapshot.revisionId }
        })
        return load(snapshot.id)
      },
      /**
       * 保存逐篇试读目标状态
       * @param id - 独立短文编号
       * @param enabled - 管理员选择的试读状态
       * @param expectedVersion - 当前内容版本
       * @returns 服务端确认的状态与新版本
       */ trial: async (id, enabled, expectedVersion) => {
        const signature = `${id}:${expectedVersion}:${enabled}`
        if (!trialKeys.has(signature)) trialKeys.set(signature, createIdempotencyKey())
        const result = await client.request<{ version: number }>({
          method: 'PUT',
          path: `${base}/${encodeURIComponent(id)}/trial`,
          headers: { 'Idempotency-Key': trialKeys.get(signature)! },
          body: { expected_version: expectedVersion, enabled }
        })
        for (const [revisionId, snapshot] of snapshots) {
          if (snapshot.id === id)
            snapshots.set(revisionId, {
              ...snapshot,
              version: result.version,
              trialVersion: result.version,
              trialEnabled: enabled
            })
        }
        return { enabled, version: result.version }
      },
      /**
       * 绑定上传后重新读取实际内容与编辑版本
       * @param snapshot - 当前已保存短文
       * @param file - 管理员选择音频
       * @param key - 上传和绑定的固定重试身份
       * @param progress - 实际上传进度
       * @param signal - 离页取消信号
       * @returns 绑定后的实际草稿
       */ uploadAudio: async (snapshot, file, key, progress, signal) => {
        await audioUploads.upload(snapshot, file, key, progress, signal)
        return load(snapshot.id)
      },
      /**
       * 保存全局运营顺序，不修改历史正文或段落快照
       * @param id - 短文固定内容编号
       * @param order - int32 全局顺序
       * @param expectedVersion - 当前内容版本
       * @param key - 同载荷失败重试身份
       * @returns 实际顺序与新内容版本
       */ sort: async (id, order, expectedVersion, key) => {
        if (!Number.isInteger(order) || order < -2147483648 || order > 2147483647)
          throw new Error('短文排序必须为 int32 整数')
        const result = await client.request<{ version: number; sort_order: number }>({
          method: 'POST',
          path: `${base}/${encodeURIComponent(id)}/sort-order`,
          headers: { 'Idempotency-Key': key },
          body: { expected_version: expectedVersion, sort_order: order }
        })
        for (const [revisionId, snapshot] of snapshots) {
          if (snapshot.id === id)
            snapshots.set(revisionId, {
              ...snapshot,
              version: result.version,
              trialVersion: result.version,
              sortOrder: result.sort_order
            })
        }
        return { version: result.version, sortOrder: result.sort_order }
      },
      /**
       * 检查当前独立短文候选
       * @param revisionId - 固定候选修订编号
       * @returns 真实服务检查结果
       */ check: async (revisionId) => {
        const snapshot = snapshotFor(revisionId)
        const result = await client.request<{ ready: boolean; error_codes: string[] }>({
          method: 'POST',
          path: `${base}/${encodeURIComponent(snapshot.id)}/revisions/${encodeURIComponent(revisionId)}/publish-check`
        })
        return { ready: result.ready, errors: result.error_codes, version: snapshot.version }
      },
      /**
       * 人工确认发布单篇已检查版本
       * @param revisionId - 明确选中的候选修订
       * @param version - 发布检查时的内容版本
       * @param key - 当前发布动作的固定命令键
       * @returns 服务端当前发布内容
       */ publish: async (revisionId, version, key) => {
        const snapshot = snapshotFor(revisionId)
        await client.request({
          method: 'POST',
          path: `${base}/${encodeURIComponent(snapshot.id)}/revisions/${encodeURIComponent(revisionId)}/publish`,
          headers: { 'Idempotency-Key': key },
          body: { expected_version: version, manual_confirmed: true }
        })
        return load(snapshot.id)
      }
    }
  }

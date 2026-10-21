import { reactive } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch, ImportEdit, ImportEntry, ImportItem } from '@/shared/types/import'

/** 从已提交暂存产生独立编辑值
 * @param item 服务器已确认的单卡暂存
 * @returns 可编辑正文与明确更新目标
 */
const editValue = (item: ImportItem): ImportEdit => ({
  content: JSON.parse(
    JSON.stringify({
      ...item.content,
      dialogue: item.content.dialogue || [],
      vocabulary: item.content.vocabulary || [],
      chunks: item.content.chunks || []
    })
  ),
  selected: item.selected && item.state !== 'duplicate',
  target_card_id: item.target_card_id,
  target_revision: item.target_revision,
  update_confirmed: !!item.target_card_id
})

/** 保留每张卡的未提交输入及原请求，暂存不写入正式卡片
 * @param batchId 当前已创建批次的标识
 * @returns 暂存编辑集合、恢复与保存操作
 */
export const useImportStaging = (batchId: () => string) => {
  const entries = reactive<Record<string, ImportEntry>>({})
  const pending = new Map<
    string,
    { key: string; body: components['schemas']['StageItem']; unknown: boolean }
  >()
  const running = new Map<string, Promise<boolean>>()
  /** 判断尚未确认落盘的本地编辑
   * @param entry 当前资料的编辑状态
   * @returns 是否与已保存基准不同
   */
  const isDirty = (entry: ImportEntry) => JSON.stringify(entry.edit) !== entry.baseline
  /** 合并服务器快照时保留未提交或正在保存的输入
   * @param batch 最新批次快照
   */
  const merge = (batch: ImportBatch) => {
    const retained = new Set(batch.items.map((item) => item.id))
    for (const id of Object.keys(entries)) {
      if (!retained.has(id)) {
        delete entries[id]
        pending.delete(id)
      }
    }
    for (const item of batch.items) {
      const existing = entries[item.id]
      if (existing && item.revision < existing.item.revision) continue
      if (existing && (isDirty(existing) || existing.saving)) {
        // Availability may change without a staging revision; keep local edits and their revision
        existing.item.state = item.state
        existing.item.suggested_target_id = item.suggested_target_id
        existing.item.issues = item.issues
        continue
      }
      const edit = editValue(item)
      entries[item.id] = {
        item,
        edit,
        baseline: JSON.stringify(edit),
        saving: false,
        error: '',
        conflict: false,
        reviewedContent: JSON.stringify(edit.content)
      }
    }
  }
  /** 清理当前批次的编辑状态，仅在离开保护已通过后使用 */
  const clear = () => {
    for (const id of Object.keys(entries)) delete entries[id]
    pending.clear()
  }
  /** 保存同一资料的冻结快照，收到响应前输入的新修改继续保留
   * @param entry 当前资料的独立编辑值
   * @returns 本次冻结快照是否已落盘
   */
  const save = (entry: ImportEntry): Promise<boolean> => {
    const existing = running.get(entry.item.id)
    if (existing) return existing
    if (!isDirty(entry) && !pending.has(entry.item.id)) return Promise.resolve(true)
    if (entry.conflict) return Promise.resolve(false)
    if (
      !pending.has(entry.item.id) &&
      entry.edit.target_card_id &&
      (!entry.edit.update_confirmed || JSON.stringify(entry.edit.content) !== entry.reviewedContent)
    ) {
      entry.edit.update_confirmed = false
      entry.error = '资料已修改，请再次核对更新目标与差异；本地输入保留'
      return Promise.resolve(false)
    }
    entry.saving = true
    entry.error = ''
    let operation = pending.get(entry.item.id)
    if (!operation) {
      operation = {
        key: crypto.randomUUID(),
        body: JSON.parse(JSON.stringify({ revision: entry.item.revision, ...entry.edit })),
        unknown: false
      }
      pending.set(entry.item.id, operation)
    }
    const fixed = operation
    const promise = (async () => {
      try {
        let receipt: ImportItem | null = null
        if (fixed.unknown) {
          try {
            const value = await api.request<components['schemas']['OperationResponse']>(
              `/api/admin/v1/operations/${fixed.key}`
            )
            receipt = value.result as ImportItem
          } catch (reason) {
            if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
          }
        }
        receipt ||= await api.request<ImportItem>(
          `/api/admin/v1/imports/${batchId()}/items/${entry.item.id}`,
          { method: 'PATCH', body: fixed.body, key: fixed.key }
        )
        if (entries[entry.item.id] !== entry) return false
        const { revision: _revision, ...sent } = fixed.body
        const editedDuringRequest = JSON.stringify(entry.edit) !== JSON.stringify(sent)
        const accepted = editValue(receipt)
        entry.item = receipt
        entry.baseline = JSON.stringify(accepted)
        entry.reviewedContent = JSON.stringify(accepted.content)
        if (!editedDuringRequest) entry.edit = accepted
        pending.delete(entry.item.id)
        return true
      } catch (reason) {
        fixed.unknown =
          !(reason instanceof ApiError) ||
          !reason.status ||
          reason.status >= 500 ||
          reason.code === 'response_unknown'
        entry.conflict = reason instanceof ApiError && reason.status === 409
        entry.error = reason instanceof Error ? reason.message : '暂存未保存，请重试'
        if (!fixed.unknown) pending.delete(entry.item.id)
        return false
      } finally {
        entry.saving = false
        running.delete(entry.item.id)
      }
    })()
    running.set(entry.item.id, promise)
    return promise
  }
  /** 提交所有本地改动后才允许进入确认；不会丢弃失败输入
   * @returns 所有编辑是否已持久化
   */
  const flush = async () => {
    for (const entry of Object.values(entries)) {
      if (!(await save(entry))) return false
      if (isDirty(entry) && !(await save(entry))) return false
    }
    return Object.values(entries).every((entry) => !isDirty(entry))
  }
  /** 显式处理冲突后采用最新修订，可选择保留本地完整资料
   * @param item 已展示给管理员核对的最新服务器暂存
   * @param keepLocal 是否明确保留本地编辑并重新暂存
   */
  const resolveConflict = (item: ImportItem, keepLocal: boolean) => {
    const entry = entries[item.id]
    if (!entry) return
    entry.item = item
    const latest = editValue(item)
    entry.baseline = JSON.stringify(latest)
    if (!keepLocal) entry.edit = latest
    entry.reviewedContent = JSON.stringify(latest.content)
    entry.conflict = false
    entry.error = ''
    pending.delete(item.id)
  }
  /** 仅确认已经发送的暂存结果，移除时不提交准备放弃的新输入
   * @param entry 准备从本次导入移除的核对记录
   * @returns 是否不存在仍未知的写入结果
   */
  const settle = async (entry: ImportEntry) => {
    const current = running.get(entry.item.id)
    if (current) await current
    if (pending.has(entry.item.id)) await save(entry)
    return !pending.has(entry.item.id)
  }
  return { entries, isDirty, merge, save, flush, clear, resolveConflict, settle }
}

import { ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  CampaignAdapter,
  CampaignDetail,
  CampaignDraft,
  CampaignOperation
} from './campaign-adapter'

/**
 * 活动编辑状态；冲突后只刷新服务端版本，保留管理员草稿。
 * @param adapter - 活动接口适配器
 * @returns 活动编辑控制器
 */
export function useCampaignEditor(adapter: CampaignAdapter) {
  const server = shallowRef<CampaignDetail | null>(null)
  const draft = ref<CampaignDraft>({
    name: '',
    durationDays: 3,
    activationWindowDays: 7,
    capacity: 1,
    sceneIds: []
  })
  const state = ref<'idle' | 'loading' | 'error' | 'success' | 'submitting'>('idle')
  const error = ref<string | null>(null)
  const conflict = ref(false)
  const conflictVersion = ref<number | null>(null)
  let commandKey = createIdempotencyKey()
  let commandFingerprint = ''

  /**
   * 加载活动详情。
   * @param id - 活动编号
   * @param keepDraft - 是否保留管理员输入
   * @returns 加载完成的 Promise
   */
  async function load(id: string, keepDraft = false): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      const result = await adapter.detail(id)
      server.value = result
      if (conflict.value) conflictVersion.value = result.version
      if (!keepDraft)
        draft.value = {
          name: result.name,
          durationDays: result.currentVersion?.durationDays === 5 ? 5 : 3,
          activationWindowDays: result.currentVersion?.activationWindowDays ?? 7,
          capacity: result.currentVersion?.capacity ?? 1,
          sceneIds: [...(result.currentVersion?.sceneIds ?? [])]
        }
      state.value = 'success'
    } catch (failure) {
      state.value = 'error'
      error.value = failure instanceof ApiError ? failure.message : '活动详情加载失败，请重试'
      throw failure
    }
  }

  /**
   * 执行单次活动命令并处理冲突。
   * @param action - 待执行的命令
   * @param id - 可刷新详情的活动编号
   * @returns 服务端活动详情
   */
  async function execute(
    action: () => Promise<CampaignDetail>,
    id?: string
  ): Promise<CampaignDetail> {
    if (state.value === 'submitting') throw new Error('操作正在提交')
    state.value = 'submitting'
    error.value = null
    conflict.value = false
    conflictVersion.value = null
    try {
      const result = await action()
      server.value = result
      state.value = 'success'
      commandKey = createIdempotencyKey()
      commandFingerprint = ''
      return result
    } catch (failure) {
      const isConflict = failure instanceof ApiError && failure.status === 409
      conflict.value = isConflict
      error.value = failure instanceof ApiError ? failure.message : '活动操作失败，请重试'
      state.value = 'error'
      if (isConflict && id) {
        try {
          server.value = await adapter.detail(id)
          conflictVersion.value = server.value.version
        } catch {
          /* Preserve the draft and show the original conflict. */
        }
      }
      throw failure
    }
  }

  /**
   * 为逻辑操作复用幂等键。
   * @param fingerprint - 操作及输入指纹
   * @returns 幂等键
   */
  function keyFor(fingerprint: string): string {
    if (commandFingerprint !== fingerprint) {
      commandFingerprint = fingerprint
      commandKey = createIdempotencyKey()
    }
    return commandKey
  }

  /**
   * 保存当前管理员草稿。
   * @returns 保存后的服务端活动详情
   */
  function save(): Promise<CampaignDetail> {
    const id = server.value?.id ?? null
    const expectedVersion = server.value?.version ?? null
    const snapshot = { ...draft.value, sceneIds: [...draft.value.sceneIds] }
    return execute(
      () =>
        adapter.save(
          id,
          snapshot,
          expectedVersion,
          keyFor(JSON.stringify(['save', id, expectedVersion, snapshot]))
        ),
      id ?? undefined
    )
  }
  /**
   * 复制当前活动版本。
   * @returns 复制版本后的服务端活动详情
   */
  function copy(): Promise<CampaignDetail> {
    if (!server.value) throw new Error('请先加载活动')
    const { id, version } = server.value
    return execute(
      () => adapter.copy(id, version, keyFor(JSON.stringify(['copy', id, version]))),
      id
    )
  }
  /**
   * 执行活动状态或容量命令。
   * @param operation - 服务端声明的命令
   * @param capacity - 调整容量时的新值
   * @returns 更新后的活动详情
   */
  function command(operation: CampaignOperation, capacity?: number): Promise<CampaignDetail> {
    if (!server.value) throw new Error('请先加载活动')
    const { id, version } = server.value
    return execute(
      () =>
        adapter.command(
          id,
          operation,
          version,
          keyFor(JSON.stringify([operation, id, version, capacity])),
          capacity
        ),
      id
    )
  }
  return { server, draft, state, error, conflict, conflictVersion, load, save, copy, command }
}

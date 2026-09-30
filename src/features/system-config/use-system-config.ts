import { readonly, ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { SystemConfigAdapter } from './system-config-adapter'
import type { SystemConfigDraft, SystemConfigSnapshot } from './system-config-model'
import type { DeepReadonly, Ref } from 'vue'

import { CONFIG_KEYS, getConfigValue, validateSystemConfig } from './system-config-model'

export interface ConfigConflict {
  remoteDraft: SystemConfigDraft
  remoteVersion: number
}
export interface SystemConfigController {
  applySnapshot(snapshot: SystemConfigSnapshot): void
  conflict: DeepReadonly<Ref<ConfigConflict | null>>
  draft: DeepReadonly<Ref<SystemConfigDraft | null>>
  dismissConflict(): void
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  isReady: Readonly<Ref<boolean>>
  isSaving: Readonly<Ref<boolean>>
  load(): Promise<void>
  save(nextDraft: SystemConfigDraft): Promise<void>
}

/**
 * 创建系统配置加载、保存与冲突控制器
 *
 * @param adapter - 系统配置接口适配器
 * @returns 系统配置控制器
 */
export function useSystemConfig(adapter: SystemConfigAdapter): SystemConfigController {
  const draft = shallowRef<SystemConfigDraft | null>(null)
  const versions = ref<Partial<Record<string, number>>>({})
  const conflict = shallowRef<ConfigConflict | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const isReady = ref(false)
  const isSaving = ref(false)

  /**
   * 应用服务端配置快照
   *
   * @param snapshot - 配置草稿与版本映射
   * @returns 无返回值
   */
  function applySnapshot(snapshot: SystemConfigSnapshot): void {
    if (
      Object.values(CONFIG_KEYS).some(
        (key) => !Number.isSafeInteger(snapshot.versions[key]) || (snapshot.versions[key] ?? 0) < 1
      )
    )
      throw new Error('系统配置缺少完整版本')
    draft.value = { ...snapshot.draft }
    versions.value = { ...snapshot.versions }
    isReady.value = true
  }

  /**
   * 关闭冲突比较，保留草稿及已读取的远端版本供再次保存
   * @returns 无返回值
   */
  function dismissConflict(): void {
    conflict.value = null
  }

  /**
   * 加载最新系统配置
   *
   * @returns 加载完成后的 Promise
   */
  async function load(): Promise<void> {
    if (isLoading.value || isSaving.value) return
    isLoading.value = true
    isReady.value = false
    error.value = null
    try {
      applySnapshot(await adapter.load())
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '系统配置加载失败'
      throw failure
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 使用各键期望版本保存草稿并处理 409 冲突
   *
   * @param nextDraft - 管理员本地草稿
   * @returns 保存完成后的 Promise
   */
  async function save(nextDraft: SystemConfigDraft): Promise<void> {
    if (!isReady.value || isLoading.value) throw new Error('配置尚未加载，请先重新读取配置')
    if (isSaving.value) throw new Error('配置正在保存，请等待完成')
    const validation = validateSystemConfig(nextDraft)
    if (!validation.valid) throw new Error(validation.message)
    draft.value = { ...nextDraft }
    conflict.value = null
    error.value = null
    isSaving.value = true
    try {
      for (const key of Object.values(CONFIG_KEYS)) {
        const version = versions.value[key]
        if (version === undefined) throw new Error('系统配置缺少完整版本')
        const updated = await adapter.update(key, getConfigValue(nextDraft, key), version)
        versions.value[key] = updated.version
      }
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '系统配置保存失败'
      if (failure instanceof ApiError && failure.status === 409) {
        const remote = await adapter.load()
        versions.value = { ...remote.versions }
        conflict.value = {
          remoteDraft: remote.draft,
          remoteVersion: Math.max(
            0,
            ...Object.values(remote.versions).filter(
              (value): value is number => typeof value === 'number'
            )
          )
        }
      }
      throw failure
    } finally {
      isSaving.value = false
    }
  }

  return {
    applySnapshot,
    conflict: readonly(conflict),
    draft: readonly(draft),
    dismissConflict,
    error: readonly(error),
    isLoading: readonly(isLoading),
    isReady: readonly(isReady),
    isSaving: readonly(isSaving),
    load,
    save
  }
}

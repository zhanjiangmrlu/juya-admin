import { ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

export interface LearningFeaturesSnapshot {
  recordingEnabled: boolean
  profileCompletionEnabled: boolean
  version: number
}
export interface LearningFeaturesAdapter {
  load(): Promise<LearningFeaturesSnapshot>
  save(
    enabled: boolean,
    profileEnabled: boolean,
    version: number,
    key: string
  ): Promise<LearningFeaturesSnapshot>
}

/**
 * 管理独立录音审核开关与固定版本命令
 * @param adapter - 实际学习功能配置适配器
 * @returns 可保存、恢复与清理的页面状态
 */
export const useLearningFeatures = (adapter: LearningFeaturesAdapter) => {
  const snapshot = shallowRef<LearningFeaturesSnapshot | null>(null)
  const enabled = ref(false)
  const profileEnabled = ref(false)
  const busy = ref(false)
  const error = ref('')
  const conflict = ref(false)
  let disposed = false
  let generation = 0
  let signature = ''
  let key = ''

  /**
   * 执行配置命令并隔离离页或旧请求返回
   * @param action - 固定版本的读取或保存动作
   * @returns 本次动作完成状态
   */
  const execute = async (action: () => Promise<LearningFeaturesSnapshot>): Promise<void> => {
    if (busy.value || disposed) return
    const token = ++generation
    busy.value = true
    error.value = ''
    try {
      const result = await action()
      if (disposed || token !== generation) return
      snapshot.value = result
      enabled.value = result.recordingEnabled
      profileEnabled.value = result.profileCompletionEnabled
      signature = ''
      conflict.value = false
    } catch (failure) {
      if (disposed || token !== generation) return
      error.value = failure instanceof Error ? failure.message : '录音配置操作失败'
      if (failure instanceof ApiError && failure.status === 409) conflict.value = true
    } finally {
      if (token === generation) busy.value = false
    }
  }
  /** 明确放弃本地修改并读取权威版本 */
  const load = async (): Promise<void> => {
    if (busy.value || disposed) return
    snapshot.value = null
    await execute(() => adapter.load())
  }
  /** 保存当前开关；不确定响应保留原请求身份 */
  const save = async (): Promise<void> => {
    if (!snapshot.value || busy.value || conflict.value || disposed) return
    const value = enabled.value
    const profile = profileEnabled.value
    const version = snapshot.value.version
    const next = JSON.stringify([value, profile, version])
    if (signature !== next) {
      signature = next
      key = createIdempotencyKey()
    }
    await execute(() => adapter.save(value, profile, version, key))
  }
  /** 离页使迟到返回失效并释放配置输入 */
  const dispose = (): void => {
    disposed = true
    generation++
    snapshot.value = null
    enabled.value = false
    profileEnabled.value = false
    busy.value = false
  }
  return { snapshot, enabled, profileEnabled, busy, error, conflict, load, save, dispose }
}

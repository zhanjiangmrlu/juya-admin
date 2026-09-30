import { readonly, ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type {
  DiscoveryAdapter,
  DiscoveryConfigDraft,
  DiscoveryConfigSnapshot
} from './discovery-adapter'
import type { DeepReadonly, Ref } from 'vue'

export interface DiscoveryConflict {
  remote: DiscoveryConfigSnapshot
  remoteVersion: number
}

export interface DiscoveryConfigController {
  applySnapshot(snapshot: DiscoveryConfigSnapshot): void
  conflict: DeepReadonly<Ref<DiscoveryConflict | null>>
  draft: DeepReadonly<Ref<DiscoveryConfigDraft | null>>
  error: Readonly<Ref<string | null>>
  load(): Promise<void>
  save(nextDraft: DiscoveryConfigDraft): Promise<void>
  state: Readonly<Ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>>
  version: Readonly<Ref<number>>
}

/**
 * 创建配置加载、恢复和乐观锁保存控制器
 *
 * @param adapter - 发现页配置适配器
 * @returns 配置页面控制器
 */
export function useDiscoveryConfig(adapter: DiscoveryAdapter): DiscoveryConfigController {
  const draft = shallowRef<DiscoveryConfigDraft | null>(null)
  const version = ref(0)
  const conflict = shallowRef<DiscoveryConflict | null>(null)
  const error = ref<string | null>(null)
  const state = ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>('idle')

  /**
   * 应用一次服务端快照
   * @param snapshot - 服务端配置快照
   */
  function applySnapshot(snapshot: DiscoveryConfigSnapshot): void {
    version.value = snapshot.version
    draft.value = cloneDraft(snapshot)
  }

  /** 加载并替换当前表单快照。 */
  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      applySnapshot(await adapter.load())
      conflict.value = null
      state.value = 'success'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '发现页配置加载失败'
      state.value = 'error'
      throw failure
    }
  }

  /**
   * 使用当前版本保存本地草稿
   * @param nextDraft - 待保存的本地草稿
   */
  async function save(nextDraft: DiscoveryConfigDraft): Promise<void> {
    const localDraft = cloneDraft(nextDraft)
    draft.value = localDraft
    conflict.value = null
    error.value = null
    state.value = 'saving'
    try {
      applySnapshot(await adapter.save(localDraft, version.value))
      state.value = 'success'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '发现页配置保存失败'
      state.value = 'error'
      if (failure instanceof ApiError && failure.status === 409) {
        try {
          const remote = await adapter.load()
          version.value = remote.version
          conflict.value = { remote, remoteVersion: remote.version }
        } catch {
          const remoteVersion = failure.details.current_version
          if (typeof remoteVersion === 'number') {
            version.value = remoteVersion
            conflict.value = {
              remote: { ...localDraft, version: remoteVersion },
              remoteVersion
            }
          }
        }
      }
      throw failure
    }
  }

  return {
    applySnapshot,
    conflict: readonly(conflict),
    draft: readonly(draft),
    error: readonly(error),
    load,
    save,
    state: readonly(state),
    version: readonly(version)
  }
}

/**
 * 深复制可编辑配置，避免远端快照与本地表单共享引用
 *
 * @param source - 待复制的配置草稿
 * @returns 与原对象断开引用的草稿
 */
function cloneDraft(source: DiscoveryConfigDraft): DiscoveryConfigDraft {
  return {
    learningModules: { ...source.learningModules },
    openSceneIds: [...source.openSceneIds],
    previewBySeries: Object.fromEntries(
      Object.entries(source.previewBySeries).map(([seriesId, sceneIds]) => [
        seriesId,
        [...sceneIds]
      ])
    )
  }
}

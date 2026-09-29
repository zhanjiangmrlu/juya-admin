import { readonly, ref } from 'vue'

import type { Ref } from 'vue'

export interface RevisionController {
  canAutosave: Readonly<Ref<boolean>>
  conflict: Readonly<Ref<boolean>>
  observeRemoteRevision(revision: number): void
  revision: Readonly<Ref<number>>
}

/**
 * 创建防止覆盖远端新版本的 revision 控制器
 *
 * @param initialRevision - 首次加载的版本号
 * @returns revision 冲突控制器
 */
export function createRevisionController(initialRevision: number): RevisionController {
  const revision = ref(initialRevision)
  const conflict = ref(false)
  const canAutosave = ref(true)

  /**
   * 观察服务端最新版本并在变化时停止自动保存
   *
   * @param remoteRevision - 服务端最新版本号
   * @returns 无返回值
   */
  function observeRemoteRevision(remoteRevision: number): void {
    if (remoteRevision !== revision.value) {
      conflict.value = true
      canAutosave.value = false
    }
  }

  return {
    canAutosave: readonly(canAutosave),
    conflict: readonly(conflict),
    observeRemoteRevision,
    revision: readonly(revision)
  }
}

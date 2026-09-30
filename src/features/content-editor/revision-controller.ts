import { readonly, ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { DeepReadonly, Ref } from 'vue'

export interface RevisionController {
  acceptSavedVersion(version: number, content: Record<string, unknown>): void
  canAutosave: Readonly<Ref<boolean>>
  conflict: Readonly<Ref<boolean>>
  draft: DeepReadonly<Ref<Record<string, unknown>>>
  handleSaveFailure(failure: unknown): void
  observeRemoteRevision(revision: number): void
  remoteVersion: Readonly<Ref<number | null>>
  replaceDraft(content: Record<string, unknown>): void
  revision: Readonly<Ref<number>>
}

/**
 * 创建防止覆盖远端新版本的 revision 控制器
 *
 * @param initialRevision - 首次加载的版本号
 * @param initialDraft - 首次加载的本地草稿
 * @returns revision 冲突控制器
 */
export function createRevisionController(
  initialRevision: number,
  initialDraft: Record<string, unknown> = {}
): RevisionController {
  const revision = ref(initialRevision)
  const draft = shallowRef<Record<string, unknown>>({ ...initialDraft })
  const remoteVersion = ref<null | number>(null)
  const conflict = ref(false)
  const canAutosave = ref(true)

  /**
   * 记录远端版本，并在版本变化时阻止自动保存
   * @param nextRevision - 远端当前版本
   */
  function observeRemoteRevision(nextRevision: number): void {
    if (nextRevision !== revision.value) {
      remoteVersion.value = nextRevision
      conflict.value = true
      canAutosave.value = false
    }
  }

  /**
   * 将保存失败中的 409 版本信息转换为冲突状态
   * @param failure - 保存请求抛出的错误
   */
  function handleSaveFailure(failure: unknown): void {
    if (!(failure instanceof ApiError) || failure.status !== 409) return
    const currentVersion = failure.details.current_version
    if (typeof currentVersion === 'number') observeRemoteRevision(currentVersion)
    else {
      conflict.value = true
      canAutosave.value = false
    }
  }

  /**
   * 使用新的本地内容替换控制器草稿
   * @param content - 新草稿内容
   */
  function replaceDraft(content: Record<string, unknown>): void {
    draft.value = { ...content }
  }

  /**
   * 接受服务端保存结果并清除冲突状态
   * @param version - 服务端新版本号
   * @param content - 已保存内容
   */
  function acceptSavedVersion(version: number, content: Record<string, unknown>): void {
    revision.value = version
    draft.value = { ...content }
    remoteVersion.value = null
    conflict.value = false
    canAutosave.value = true
  }

  return {
    acceptSavedVersion,
    canAutosave: readonly(canAutosave),
    conflict: readonly(conflict),
    draft: readonly(draft),
    handleSaveFailure,
    observeRemoteRevision,
    remoteVersion: readonly(remoteVersion),
    replaceDraft,
    revision: readonly(revision)
  }
}

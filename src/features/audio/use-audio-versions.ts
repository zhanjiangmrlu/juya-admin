import { readonly, ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { useIdempotentCommand } from '@/shared/commands/idempotent-command'

import type { AudioAdapter } from './audio-adapter'
import type { AudioTarget, AudioVersion } from './audio-version-model'
import type { DeepReadonly, Ref } from 'vue'

import { validateAudioBatch } from './audio-version-model'
import { matchAudioTarget } from './upload-target-matcher'

export interface AudioUploadItem {
  error: null | string
  file: File
  id: string
  idempotencyKey: string
  progress: number
  status: 'cancelled' | 'completed' | 'failed' | 'queued' | 'uploading'
  targetId: string | null
}

export interface AudioVersionsController {
  addUploads(files: readonly File[]): AudioUploadItem[]
  assignUploadTarget(itemId: string, targetId: string | null): void
  removeUpload(itemId: string): void
  cancelUpload(itemId: string): void
  confirm(versionId: string): Promise<void>
  error: Readonly<Ref<null | string>>
  generate(text: string, voice: string): Promise<string>
  load(): Promise<void>
  rollback(versionId: string): Promise<void>
  selectTarget(targetId: string): Promise<void>
  selectedTarget: DeepReadonly<Ref<AudioTarget | null>>
  startAllUploads(): Promise<void>
  startUpload(itemId: string): Promise<void>
  state: Readonly<Ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>>
  targets: DeepReadonly<Ref<AudioTarget[]>>
  upload(assetId: string): Promise<void>
  uploads: DeepReadonly<Ref<AudioUploadItem[]>>
  versions: DeepReadonly<Ref<AudioVersion[]>>
}

/**
 * 管理场景音频目标、候选版本及人工优先操作
 *
 * @param adapter - 音频版本适配器
 * @param sceneId - 当前场景编号
 * @returns 音频版本控制器
 */
export function useAudioVersions(adapter: AudioAdapter, sceneId: string): AudioVersionsController {
  const targets = ref<AudioTarget[]>([])
  const selectedTarget = shallowRef<AudioTarget | null>(null)
  const versions = ref<AudioVersion[]>([])
  const uploads = ref<AudioUploadItem[]>([])
  const error = ref<null | string>(null)
  const state = ref<'error' | 'idle' | 'loading' | 'saving' | 'success'>('idle')
  const uploadAbortControllers = new Map<string, AbortController>()
  const confirmCommand = useIdempotentCommand((versionId: string, key) =>
    adapter.confirmVersion(versionId, key)
  )
  const rollbackCommand = useIdempotentCommand(
    (input: { targetId: string; versionId: string }, key) =>
      adapter.rollback(input.targetId, input.versionId, key)
  )
  const uploadVersionCommand = useIdempotentCommand(
    (input: { assetId: string; targetId: string }, key) =>
      adapter.uploadVersion(input.targetId, input.assetId, key)
  )
  const generateCommand = useIdempotentCommand(
    (
      input: {
        stableKey: string
        targetId: string
        targetType: string
        text: string
        voice: string
      },
      key
    ) =>
      adapter.generate(
        input.targetId,
        {
          stableKey: input.stableKey,
          targetType: input.targetType,
          text: input.text,
          voice: input.voice
        },
        key
      )
  )

  /** 加载场景音频目标及第一个目标的版本。 */
  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      const nextTargets = await adapter.listTargets(sceneId)
      const nextSelected = nextTargets[0] ?? null
      const nextVersions = nextSelected ? await adapter.listVersions(nextSelected.id) : []
      targets.value = nextTargets
      selectedTarget.value = nextSelected
      versions.value = nextVersions
      state.value = 'success'
    } catch (failure) {
      fail(failure, '音频版本加载失败')
      throw failure
    }
  }

  /**
   * 切换音频目标并加载版本；失败时保留原选择和版本
   * @param targetId - 音频目标编号
   */
  async function selectTarget(targetId: string): Promise<void> {
    const target = targets.value.find((item) => item.id === targetId)
    if (!target) return
    state.value = 'loading'
    error.value = null
    try {
      const nextVersions = await adapter.listVersions(target.id)
      selectedTarget.value = target
      versions.value = nextVersions
      state.value = 'success'
    } catch (failure) {
      fail(failure, '音频版本加载失败')
      throw failure
    }
  }

  /**
   * 添加经过批量规则校验的本地音频文件
   * @param files - 用户选择的音频文件
   * @returns 新增队列项
   */
  function addUploads(files: readonly File[]): AudioUploadItem[] {
    const validation = validateAudioBatch([...uploads.value.map((item) => item.file), ...files])
    if (!validation.valid) throw new Error(validation.message)
    const nextItems = files.map((file) => ({
      error: null,
      file,
      id: createIdempotencyKey(),
      idempotencyKey: createIdempotencyKey(),
      progress: 0,
      status: 'queued' as const,
      targetId: matchAudioTarget(file.name, targets.value)
    }))
    uploads.value.push(...nextItems)
    return nextItems
  }

  /**
   * 只有尚未提交的项可重新匹配，避免丢失响应后同一素材产生不同目标副作用。
   * @param itemId - 上传队列项编号
   * @param targetId - 明确匹配的稳定目标编号
   */
  function assignUploadTarget(itemId: string, targetId: string | null): void {
    const item = uploads.value.find((candidate) => candidate.id === itemId)
    if (!item || item.status !== 'queued') return
    if (targetId !== null && !targets.value.some((target) => target.id === targetId))
      throw new Error('音频目标不存在')
    item.targetId = targetId
    item.error = null
  }

  /** 移除尚未提交的文件，不丢弃已经发出的幂等命令。
   * @param itemId - 未提交的队列项编号
   */
  function removeUpload(itemId: string): void {
    uploads.value = uploads.value.filter((item) => item.id !== itemId || item.status !== 'queued')
  }

  /**
   * 上传一个音频文件并创建人工候选版本。失败只影响当前队列项
   * @param itemId - 上传队列项编号
   */
  async function startUpload(itemId: string): Promise<void> {
    const item = uploads.value.find((candidate) => candidate.id === itemId)
    if (!item || item.status === 'uploading' || item.status === 'completed') return
    if (!item.targetId) {
      item.error = '未匹配文件，请先指定稳定目标'
      return
    }
    const abortController = new AbortController()
    uploadAbortControllers.set(item.id, abortController)
    item.status = 'uploading'
    item.error = null
    state.value = 'saving'
    error.value = null
    try {
      await adapter.uploadFile(
        item.targetId,
        item.file,
        item.idempotencyKey,
        (progress) => {
          item.progress = progress
        },
        abortController.signal
      )
      item.progress = 100
      item.status = 'completed'
      if (selectedTarget.value?.id === item.targetId)
        versions.value = await adapter.listVersions(item.targetId)
      state.value = 'success'
    } catch (failure) {
      const cancelled = abortController.signal.aborted
      item.status = cancelled ? 'cancelled' : 'failed'
      item.error = cancelled
        ? '上传已取消'
        : failure instanceof Error
          ? failure.message
          : '音频上传失败'
      error.value = item.error
      state.value = 'error'
    } finally {
      uploadAbortControllers.delete(item.id)
    }
  }

  /** 上传所有尚未完成的队列项，并隔离单项失败。 */
  async function startAllUploads(): Promise<void> {
    const pending = uploads.value.filter((item) =>
      ['cancelled', 'failed', 'queued'].includes(item.status)
    )
    let next = 0
    await Promise.allSettled(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (next < pending.length) {
          const item = pending[next++]
          if (item) await startUpload(item.id)
        }
      })
    )
  }

  /**
   * 取消一个正在上传的队列项
   * @param itemId - 上传队列项编号
   */
  function cancelUpload(itemId: string): void {
    uploadAbortControllers.get(itemId)?.abort()
  }

  /**
   * 确认候选版本
   * @param versionId - 版本编号
   */
  async function confirm(versionId: string): Promise<void> {
    await mutate(async () => {
      const result = await confirmCommand.submit(versionId)
      confirmCommand.reset()
      return result
    })
  }

  /**
   * 回退到历史版本
   * @param versionId - 历史版本编号
   */
  async function rollback(versionId: string): Promise<void> {
    const target = requireTarget()
    await mutate(async () => {
      const result = await rollbackCommand.submit({ targetId: target.id, versionId })
      rollbackCommand.reset()
      return result
    })
  }

  /**
   * 关联一个已确认的人工音频素材
   * @param assetId - 音频素材编号
   */
  async function upload(assetId: string): Promise<void> {
    const target = requireTarget()
    state.value = 'saving'
    error.value = null
    try {
      await uploadVersionCommand.submit({ assetId, targetId: target.id })
      uploadVersionCommand.reset()
      versions.value = await adapter.listVersions(target.id)
      state.value = 'success'
    } catch (failure) {
      fail(failure, '音频版本上传关联失败')
      throw failure
    }
  }

  /**
   * 创建 TTS 生成任务
   * @param text - 生成文本
   * @param voice - 音色标识
   * @returns 任务编号
   */
  async function generate(text: string, voice: string): Promise<string> {
    const target = requireTarget()
    state.value = 'saving'
    error.value = null
    try {
      const jobId = await generateCommand.submit({
        stableKey: target.stableKey,
        targetId: target.id,
        targetType: target.targetType,
        text,
        voice
      })
      generateCommand.reset()
      state.value = 'success'
      return jobId
    } catch (failure) {
      fail(failure, '音频生成任务创建失败')
      throw failure
    }
  }

  /**
   * 执行会改变激活版本的操作并刷新版本
   * @param action - 返回最新目标的写操作
   */
  async function mutate(action: () => Promise<AudioTarget>): Promise<void> {
    state.value = 'saving'
    error.value = null
    try {
      const target = await action()
      replaceTarget(target)
      versions.value = await adapter.listVersions(target.id)
      state.value = 'success'
    } catch (failure) {
      fail(failure, '音频版本操作失败')
      throw failure
    }
  }

  /**
   * 用服务端新快照替换当前目标
   * @param target - 最新目标
   */
  function replaceTarget(target: AudioTarget): void {
    targets.value = targets.value.map((item) => (item.id === target.id ? target : item))
    selectedTarget.value = target
  }

  /**
   * 返回当前选中的音频目标
   * @returns 当前目标
   */
  function requireTarget(): AudioTarget {
    if (!selectedTarget.value) throw new Error('请先选择音频目标')
    return selectedTarget.value
  }

  /**
   * 记录控制器错误状态
   * @param failure - 捕获的异常
   * @param fallback - 未知异常提示
   */
  function fail(failure: unknown, fallback: string): void {
    error.value = failure instanceof Error ? failure.message : fallback
    state.value = 'error'
  }

  return {
    addUploads,
    assignUploadTarget,
    cancelUpload,
    confirm,
    error: readonly(error),
    generate,
    load,
    removeUpload,
    rollback,
    selectTarget,
    selectedTarget: readonly(selectedTarget),
    startAllUploads,
    startUpload,
    state: readonly(state),
    targets: readonly(targets),
    upload,
    uploads: readonly(uploads),
    versions: readonly(versions)
  }
}

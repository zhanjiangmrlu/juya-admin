import type { SceneRevision } from '@/features/content/content-model'
import type { DialogueRow } from '@/features/content-editor/scene-form'

export interface SentenceSlice {
  sentenceId: string
  sourceVersion: string
  startMs: number
  endMs: number
  status: string
  targetId: string | null
  resourceVersion: string | null
  assetId: string | null
  durationMs: number
  dependencyHash?: string
  url?: string
  confirmed: boolean
}
export interface SentenceSliceAdapter {
  available: boolean
  list(revisionId: string): Promise<SentenceSlice[]>
  recut(
    revisionId: string,
    expectedVersion: number,
    sourceVersion: string,
    row: DialogueRow,
    key: string
  ): Promise<SceneRevision>
  confirm(
    revisionId: string,
    expectedVersion: number,
    slice: SentenceSlice,
    key: string
  ): Promise<SceneRevision>
}
export const /**
   * 检查边界是否位于解码确认的实际时长之内
   * @param start - 本句开始毫秒
   * @param end - 本句结束毫秒
   * @param duration - 实际源音频时长
   * @returns 边界是否有效
   */ validSliceBoundary = (start: number | null, end: number | null, duration: number): boolean =>
    start !== null &&
    end !== null &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    duration > 0 &&
    start >= 0 &&
    end > start &&
    end <= duration
export const /**
   * 仅允许已生成独立文件且匹配当前句子边界的切片试听
   * @param row - 当前句子及编辑边界
   * @param slice - 服务端实际切片状态
   * @param sourceVersion - 当前固定整段音频版本
   * @returns 是否可试听独立切片
   */ canListenSlice = (
    row: DialogueRow,
    slice: SentenceSlice | undefined,
    sourceVersion: string
  ): boolean =>
    !!slice &&
    ['READY', 'CONFIRMED'].includes(slice.status) &&
    !!slice.targetId &&
    !!slice.resourceVersion &&
    !!slice.assetId &&
    slice.durationMs > 0 &&
    slice.sentenceId === row.id &&
    slice.sourceVersion === sourceVersion &&
    slice.startMs === row.start_ms &&
    slice.endMs === row.end_ms
export const /**
   * 边界或文本修改后撤销旧切片与人工确认
   * @param row - 被修改的当前句子
   */ invalidateSentenceSlice = (row: DialogueRow): void => {
    row.timing_confirmed = false
    row.audio_version_id = null
    row.slice_target_id = null
    row.slice_version = null
    row.slice_dependency_hash = null
    row.boundary_verified_by = ''
  }

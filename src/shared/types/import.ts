import type { SceneContent } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'

export type ImportBatch = components['schemas']['ImportBatchView']
export type ImportItem = components['schemas']['ImportItemView']
export type ImportFile = components['schemas']['ImportFileView']
export type ImportConfirmation = components['schemas']['ImportConfirmation']
export interface ImportEdit {
  content: SceneContent
  selected: boolean
  target_card_id: string | null
  target_revision: number | null
  update_confirmed: boolean
}
export interface ImportEntry {
  item: ImportItem
  edit: ImportEdit
  baseline: string
  saving: boolean
  error: string
  conflict: boolean
  reviewedContent: string
}
export interface ImportUpload {
  id: string
  file: File
  kind: 'zip' | 'docx' | 'image' | 'audio'
  key: string
  percent: number
  busy: boolean
  error: string
  unknown: boolean
  accepted: ImportFile | null
  queued: boolean
  invalid: boolean
}

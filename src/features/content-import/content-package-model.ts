export type ImportContentType = 'dialogue' | 'word_card' | 'short_reading'
export type ImportPhase = 'upload' | 'validation' | 'preview' | 'result'
export interface ImportIssue {
  code: string
  message: string
  severity: 'error' | 'warning' | 'optional'
  path?: string
  role?: string
  action?: string
}
export interface ImportItem {
  id: string
  title: string
  contentType: ImportContentType
  file: string
  sheet: string
  row: number
  importId: string
  issues: ImportIssue[]
  status: string
  contentId?: string
  revisionId?: string
  stage?: string
  error?: string
}
export interface ImportBatch {
  id: string
  status: string
  items: ImportItem[]
  unreferencedFiles: string[]
  counts: { success: number; failed: number; skipped: number; excluded: number }
}
export interface ImportPreviewItem {
  id: string
  title: string
  action: 'CREATE' | 'UPDATE' | 'SKIP'
  expectedVersion: number
  content: Record<string, unknown>
  previous?: Record<string, unknown>
  bindings: { path: string; role: string; target: string; url?: string }[]
  requiredDefaults: string[]
}
export interface ImportPreview {
  version: string
  items: ImportPreviewItem[]
}
export interface ImportConfirmation {
  selectedItems: string[]
  previewVersion: string
  expectedVersions: Record<string, number>
  defaultConfirmations: string[]
  diffConfirmations: string[]
}
export interface PackageUploadContext {
  seriesId: string
  contentType: ImportContentType
  kind: 'zip' | 'docx' | 'word_images'
}
/** 页面视图模型由适配层映射实际 OpenAPI，不作为未经核对的请求 DTO */
export interface ContentPackageAdapter {
  available: boolean
  limits(): Promise<{ maxBytes: number; maxItems: number } | null>
  upload(
    file: globalThis.File,
    context: PackageUploadContext,
    idempotencyKey: string,
    progress: (percent: number) => void
  ): Promise<ImportBatch>
  load(id: string): Promise<ImportBatch>
  validate(id: string, excluded: string[]): Promise<ImportBatch>
  preview(id: string, excluded: string[]): Promise<ImportPreview>
  confirm(
    id: string,
    confirmation: ImportConfirmation,
    idempotencyKey: string
  ): Promise<ImportBatch>
  retry(id: string, itemIds: string[], idempotencyKey: string): Promise<ImportBatch>
  cancel(id: string, idempotencyKey: string): Promise<ImportBatch>
}

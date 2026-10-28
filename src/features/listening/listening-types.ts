import type { components } from '@/shared/contracts/generated/admin-api'

/** 表单默认字段有值，全部结构来自后端OpenAPI生成结果 */
export type ArticlePayload = Required<components['schemas']['ListeningPayload']>
export type TimelineWord = components['schemas']['TimelineWord']
export type Timeline = components['schemas']['Timeline']
export type Article = Omit<components['schemas']['Article'], 'payload'> & {
  payload: ArticlePayload
}
export type Category = components['schemas']['Category']
export type Topic = components['schemas']['Topic']
export type FreePolicy = components['schemas']['FreePolicy']
export type FreePreview = components['schemas']['FreePreview-Output']
export type Order = components['schemas']['OrderResult']
export interface Page<T> {
  items: T[]
  total: number
  page: number
  limit: number
}
export type Candidate = Omit<components['schemas']['Candidate'], 'payload'> & {
  payload: ArticlePayload
}
export interface CandidateEditor {
  candidate: Candidate
  payload: ArticlePayload
  topic: string
  mode: 'create' | 'update'
  target: Article | null
  targetId: string | null
  targetRevision: number | null
  targetError: string
}
export type ImportBatch = Omit<components['schemas']['Batch'], 'candidates'> & {
  candidates: Candidate[]
}
export type ImportPreview = components['schemas']['ImportPreview']
export type ImportResult = Omit<components['schemas']['SaveResult'], 'batch'> & {
  batch: ImportBatch
}
export type DeleteResult = components['schemas']['BatchDeleteResult']

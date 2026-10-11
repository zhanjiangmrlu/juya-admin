import type { SceneAudio } from '@/features/content-editor/scene-form'

export interface ShortReadingContent {
  title_en: string
  title_zh: string
  category: string
  topic: string
  level: string
  safe_intro: string
  copyright_source: string
  copyright_status: string
  paragraphs_en: string[]
  paragraph_ids: string[]
  translation_zh: string
  cover_asset_id: string | null
  audio:
    | (SceneAudio & {
        listening_confirmed?: boolean
        confirmed_asset_id?: string | null
        confirmed_version_id?: string | null
      })
    | null
}
export interface ShortReadingSnapshot {
  id: string
  revisionId: string
  version: number
  editVersion: number
  contentHash: string
  seriesId: string
  status: string
  content: ShortReadingContent
  trialEnabled: boolean | null
  trialVersion: number
  sortOrder?: number | null
}
export interface ShortReadingAdapter {
  available: boolean
  audioAvailable: boolean
  sortAvailable: boolean
  load(id: string): Promise<ShortReadingSnapshot>
  create(seriesId: string, content: ShortReadingContent, key: string): Promise<ShortReadingSnapshot>
  save(
    snapshot: ShortReadingSnapshot,
    content: ShortReadingContent,
    key: string
  ): Promise<ShortReadingSnapshot>
  createRevision(snapshot: ShortReadingSnapshot, key: string): Promise<ShortReadingSnapshot>
  trial(
    id: string,
    enabled: boolean,
    expectedVersion: number
  ): Promise<{ enabled: boolean; version: number }>
  uploadAudio(
    snapshot: ShortReadingSnapshot,
    file: globalThis.File,
    key: string,
    progress?: (value: number) => void,
    signal?: AbortSignal
  ): Promise<ShortReadingSnapshot>
  sort(
    id: string,
    order: number,
    expectedVersion: number,
    key: string
  ): Promise<{ version: number; sortOrder: number }>
  check(id: string): Promise<{ ready: boolean; errors: string[]; version: number }>
  publish(id: string, version: number, key: string): Promise<ShortReadingSnapshot>
}

export const /**
   * 读取纯阅读白名单，旧词语与讲解不进入短文编辑或提交
   * @param source - 服务端草稿正文
   * @returns 完整纯阅读表单
   */ normalizeShortReading = (source: Record<string, unknown>): ShortReadingContent => {
    const /**
       * 读取完整字符串内容
       * @param key - 短文表单字段
       * @returns 完整字段值或空文本
       */ text = (key: string): string => (typeof source[key] === 'string' ? source[key] : '')
    return {
      title_en: text('title_en'),
      title_zh: text('title_zh'),
      category: text('category'),
      topic: text('topic'),
      level: text('level'),
      safe_intro: text('safe_intro'),
      copyright_source: text('copyright_source') || text('source'),
      copyright_status: text('copyright_status'),
      translation_zh: text('translation_zh'),
      paragraphs_en: Array.isArray(source.paragraphs_en)
        ? source.paragraphs_en.filter((value): value is string => typeof value === 'string')
        : [],
      paragraph_ids: Array.isArray(source.paragraph_ids)
        ? source.paragraph_ids.filter((value): value is string => typeof value === 'string')
        : [],
      cover_asset_id: text('cover_asset_id').trim() || null,
      audio:
        source.audio && typeof source.audio === 'object'
          ? ({ ...source.audio } as SceneAudio)
          : null
    }
  }
export const /**
   * 提示纯阅读元数据缺项，发布仍以服务端检查为准
   * @param content - 当前短文草稿
   * @returns 可定位的缺项说明
   */ shortReadingProblems = (content: ShortReadingContent): string[] => {
    const fields: readonly [keyof ShortReadingContent, string][] = [
      ['title_en', '英文标题'],
      ['title_zh', '中文标题'],
      ['category', '类别'],
      ['topic', '题材'],
      ['level', '难度'],
      ['safe_intro', '安全简介'],
      ['copyright_source', '来源与版权说明'],
      ['translation_zh', '全文中文']
    ]
    return [
      ...fields
        .filter(([key]) => !String(content[key] ?? '').trim())
        .map(([, label]) => `请填写${label}`),
      ...(!content.paragraphs_en.length ||
      content.paragraphs_en.some((paragraph) => !paragraph.trim())
        ? ['请填写完整英文段落']
        : [])
    ]
  }

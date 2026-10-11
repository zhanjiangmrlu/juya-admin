import { createUuid } from '@/shared/utils/create-uuid'

export interface SceneAudio {
  target_id: string
  version_id: string
  asset_id: string
  duration_ms: number
}

export interface DialogueRow {
  id: string
  speaker: string
  english: string
  chinese: string
  start_ms: number | null
  end_ms: number | null
  audio_version_id: string | null
  timing_confirmed: boolean
  clickable_spans: Record<string, unknown>[]
  slice_target_id?: string | null
  slice_version?: string | null
  slice_dependency_hash?: string | null
  boundary_verified_by?: string
}

export interface LexiconRow {
  entry_id: string
  entry_version: number
  english: string
  variants: string[]
  phonetic: string
  chinese: string
  explanation: string
  source_sentence_ids: string[]
  icon_asset_id: string | null
  audio_target_id: string | null
  audio_version_id: string | null
  sense_id?: string
  source_id?: string
  source_sentence?: string
  pronunciation_text?: string
  pronunciation_target_id?: string | null
  allow_synthesis?: boolean
  reading_variant?: string
  confirmed?: boolean
  meaning_change?: 'wording' | 'new_sense' | null
}

export interface SceneContent extends Record<string, unknown> {
  title_en: string
  title_zh: string
  summary: string
  tags: string[]
  original_image_asset_id: string | null
  cover_asset_id: string | null
  copyright: string
  source: string
  audio: SceneAudio | null
  dialogue: DialogueRow[]
  vocabulary: LexiconRow[]
  chunks: LexiconRow[]
}

/** 创建拥有稳定编号的新句子。
 * @returns 空白对话行
 */
export function createDialogueRow(): DialogueRow {
  return {
    id: createUuid(),
    speaker: '',
    english: '',
    chinese: '',
    start_ms: null,
    end_ms: null,
    audio_version_id: null,
    timing_confirmed: false,
    clickable_spans: []
  }
}

/** 创建待服务端注册或复用的词库条目。
 * @returns 空白词库行
 */
export function createLexiconRow(): LexiconRow {
  return {
    entry_id: '',
    entry_version: 1,
    english: '',
    variants: [],
    phonetic: '',
    chinese: '',
    explanation: '',
    source_sentence_ids: [],
    icon_asset_id: null,
    audio_target_id: null,
    audio_version_id: null
  }
}

export const /** 填入编辑草稿，保留稳定编号和未展示字段。
   * @param source - 版本内容
   * @returns 结构化内容表单
   */
  normalizeSceneContent = (source: Record<string, unknown>): SceneContent => {
    const /** 将可清空的素材引用统一为 null。
       * @param value - 表单或服务端的编号
       * @returns 有效编号或空引用
       */
      optionalId = (value: unknown): string | null => {
        return typeof value === 'string' && value.trim() ? value.trim() : null
      }
    const /** 补齐词条字段并清除空引用。
       * @param row - 当前词条
       * @returns 可提交词条
       */
      entry = (row: Record<string, unknown>): LexiconRow => {
        return {
          ...createLexiconRow(),
          ...row,
          icon_asset_id: optionalId(row.icon_asset_id),
          audio_target_id: optionalId(row.audio_target_id),
          audio_version_id: optionalId(row.audio_version_id)
        } as LexiconRow
      }
    const /** 读取对象条目数组。
       * @param key - 内容字段
       * @returns 行数组
       */
      rows = (key: string): Record<string, unknown>[] => {
        return Array.isArray(source[key])
          ? source[key].filter(
              (row): row is Record<string, unknown> => typeof row === 'object' && row !== null
            )
          : []
      }
    return {
      ...source,
      title_en: typeof source.title_en === 'string' ? source.title_en : '',
      title_zh: typeof source.title_zh === 'string' ? source.title_zh : '',
      summary: typeof source.summary === 'string' ? source.summary : '',
      tags: Array.isArray(source.tags)
        ? source.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      original_image_asset_id: optionalId(source.original_image_asset_id),
      cover_asset_id: optionalId(source.cover_asset_id),
      copyright: typeof source.copyright === 'string' ? source.copyright : '',
      source: typeof source.source === 'string' ? source.source : '',
      audio:
        source.audio && typeof source.audio === 'object'
          ? ({ ...source.audio } as SceneAudio)
          : null,
      dialogue: rows('dialogue').map((row) => ({
        ...createDialogueRow(),
        ...row
      })) as DialogueRow[],
      vocabulary: rows('vocabulary').map(entry),
      chunks: rows('chunks').map((row) => {
        const { image_asset_id: _removedImage, ...allowed } = row
        return { ...entry(allowed), icon_asset_id: null }
      })
    }
  }

export const /** 更换整段音频时清空属于旧版本的句子标时。
   * @param content - 当前表单
   * @param audio - 新的固定音频版本
   */
  replaceSceneAudio = (content: SceneContent, audio: SceneAudio | null): void => {
    if (content.audio?.version_id !== audio?.version_id) {
      for (const row of content.dialogue) {
        row.start_ms = null
        row.end_ms = null
        row.audio_version_id = null
        row.timing_confirmed = false
        row.slice_target_id = null
        row.slice_version = null
        row.slice_dependency_hash = null
        row.boundary_verified_by = ''
      }
    }
    content.audio = audio
  }

export const /**
   * 载入固定草稿并清除上一篇元数据，保留响应全部字段
   * @param form - 保持响应式身份的页面表单
   * @param source - 本次服务端固定草稿
   */ resetSceneContent = (form: SceneContent, source: Record<string, unknown>): void => {
    for (const key of Object.keys(form)) delete form[key]
    Object.assign(form, normalizeSceneContent(source))
  }

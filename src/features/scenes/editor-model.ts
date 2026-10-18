import type { components } from '@/shared/contracts/generated/admin-api'
type RawContent = components['schemas']['SceneContent']
export type SceneContent = Omit<RawContent, 'dialogue' | 'vocabulary' | 'chunks'> & {
  dialogue: NonNullable<RawContent['dialogue']>
  vocabulary: NonNullable<RawContent['vocabulary']>
  chunks: NonNullable<RawContent['chunks']>
}
export type CardView = components['schemas']['CardView']
export type CardPreview = components['schemas']['CardPreview']

/** 创建未保存的空资料
 * @returns 新卡编辑值
 */
export const blankContent = (): SceneContent => ({
  name: '',
  title_en: '',
  image_id: null,
  audio_id: null,
  dialogue: [],
  vocabulary: [],
  chunks: []
})

/** 查找完整词汇的具体位置，偏移与浏览器 UTF-16 选择一致
 * @param dialogue 当前对话行
 * @param english 目标英文词汇
 * @returns 原句及对应片段
 */
export const findSources = (dialogue: SceneContent['dialogue'], english: string) => {
  if (!english.trim()) return []
  const escaped = english.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu')
  return dialogue.flatMap((line) =>
    Array.from(line.english.matchAll(pattern), (match) => ({
      line_id: line.id!,
      start: match.index,
      end: match.index + match[0].length,
      quote: match[0],
      sentence: line.english
    }))
  )
}

/** 复制完整编辑资料后移除全空可选语块，半填项保留核对
 * @param content 当前编辑资料
 * @returns 独立保存正文
 */
export const prepareContent = (content: SceneContent): SceneContent => {
  const snapshot: SceneContent = JSON.parse(JSON.stringify(content))
  snapshot.chunks = snapshot.chunks?.filter((row) => row.english.trim() || row.chinese.trim()) || []
  return snapshot
}

/** 解析固定粘贴格式，text 为管理员核对的三列文本
 * @param text 人物、英文、中文以竖线分隔的文本
 * @returns 已核对对话
 */
export const parseDialogue = (text: string): SceneContent['dialogue'] => {
  const rows = text.split(/\r?\n/).filter((line) => line.trim())
  if (!rows.length) throw new Error('请填写对话并确认对应关系')
  return rows.map((line) => {
    const columns = line.split('|').map((value) => value.trim())
    if (columns.length !== 3 || columns.some((value) => !value))
      throw new Error('请确认对应关系：每行应为 人物 | 英文 | 中文')
    return {
      id: crypto.randomUUID(),
      speaker: columns[0]!,
      english: columns[1]!,
      chinese: columns[2]!
    }
  })
}

import type { DialogueRow, LexiconRow } from './scene-form'
/**
 * 当前点击句优先，使用稳定句子编号保留实际来源原句及翻译。
 * @param entry - 固定词条版本
 * @param sentences - 当前完整场景句子
 * @param preferredId - 实际点击的来源句子编号
 * @returns 来源原句及其翻译
 */
export function entrySources(
  entry: LexiconRow,
  sentences: DialogueRow[],
  preferredId?: string | null
): DialogueRow[] {
  const rows = sentences.filter((row) => entry.source_sentence_ids.includes(row.id))
  const preferred = rows.find((row) => row.id === preferredId)
  return preferred ? [preferred, ...rows.filter((row) => row.id !== preferred.id)] : rows
}

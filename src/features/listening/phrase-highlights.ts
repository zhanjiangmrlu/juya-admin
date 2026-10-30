const LISTENING_PHRASE_COLORS = ['#e4efd6', '#e2edf2', '#f7e6d6', '#f6efc9'] as const
interface PhraseHighlight {
  start: number
  end: number
  color: string
}
/** 按英文表达匹配正文范围，保持原文和码点偏移，长语块优先
 * @param body 原始英文正文
 * @param phrases 按表达积累顺序的英文表达
 * @returns 不重叠的正文语块色带
 */
export const phraseHighlights = (body: string, phrases: string[]): PhraseHighlight[] => {
  const candidates: PhraseHighlight[] = []
  phrases.forEach((phrase, index) => {
    const literal = phrase.trim()
    if (!literal) return
    const pattern = literal
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')
    for (const match of body.matchAll(new RegExp(pattern, 'giu'))) {
      const before = body.slice(0, match.index),
        after = body.slice(match.index! + match[0].length)
      if (/[\p{L}\p{N}_]$/u.test(before) || /^[\p{L}\p{N}_]/u.test(after)) continue
      const start = Array.from(before).length
      candidates.push({
        start,
        end: start + Array.from(match[0]).length,
        color: LISTENING_PHRASE_COLORS[index % LISTENING_PHRASE_COLORS.length]!
      })
    }
  })
  const selected: PhraseHighlight[] = []
  for (const item of candidates.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
  )) {
    if (!selected.some((other) => item.start < other.end && item.end > other.start))
      selected.push(item)
  }
  return selected.sort((a, b) => a.start - b.start)
}

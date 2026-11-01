import type { ArticlePayload } from './listening-types'
export type VocabularyWord = ArticlePayload['vocabulary'][number]
/** 从当前英文正文提取可明确选择的原句，所有偏移使用Unicode码点
 * @param body 未改写的英文正文
 * @returns 可选择的原句及码点范围
 */
export const sentenceOptions = (body: string) =>
  [...body.matchAll(/[^\s.!?][^.!?\r\n]*[.!?]?/gu)].map((match) => {
    const start = [...body.slice(0, match.index)].length
    return { start, end: start + [...match[0]].length, quote: match[0] }
  })
/** 提供原句内实际词形，重复出现也按位置独立核对
 * @param body 当前正文
 * @param source 管理员选中的原句范围
 * @param source.start 原句起始码点
 * @param source.end 原句结束码点
 * @returns 原句内各处实际词形及码点位置
 */
export const wordOptions = (body: string, source: { start: number; end: number }) => {
  const quote = [...body].slice(source.start, source.end).join('')
  return [...quote.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu)].map((match) => {
    const word_start = source.start + [...quote.slice(0, match.index)].length
    return { word_start, word_end: word_start + [...match[0]].length, word: match[0] }
  })
}
/** 校验词汇资料及其当前正文来源，空词汇仍允许发布
 * @param body 当前英文正文
 * @param words 保持独立义项和顺序的词汇条目
 * @returns 需要管理员处理的字段问题
 */
export const vocabularyErrors = (body: string, words: VocabularyWord[]) =>
  words.flatMap((item, index) => {
    const errors: string[] = [],
      source = item.source,
      chars = [...body]
    if (
      !/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(item.english.trim()) ||
      !item.meaning.trim() ||
      !item.id ||
      words.filter((word) => word.id === item.id).length !== 1
    )
      errors.push('请补齐英文词汇和本句释义')
    if (
      !source ||
      !sentenceOptions(body).some(
        (sentence) =>
          sentence.start === source.start &&
          sentence.end === source.end &&
          sentence.quote === source.quote
      ) ||
      source.start < 0 ||
      source.end <= source.start ||
      chars.slice(source.start, source.end).join('') !== source.quote ||
      source.word_start < source.start ||
      source.word_end > source.end ||
      source.word_end <= source.word_start ||
      !wordOptions(body, { start: 0, end: chars.length }).some(
        (word) => word.word_start === source.word_start && word.word_end === source.word_end
      ) ||
      chars.slice(source.word_start, source.word_end).join('') !== source.word
    )
      errors.push('正文已变化，请重新选择来源原句和词形')
    else if (
      !source.confirmed &&
      (source.word.toLowerCase() !== item.english.trim().toLowerCase() ||
        wordOptions(body, { start: 0, end: chars.length }).filter(
          (word) => word.word.toLowerCase() === source.word.toLowerCase()
        ).length > 1)
    )
      errors.push('请确认原句及词形对应')
    return errors.map((message) => `词汇${index + 1}：${message}`)
  })

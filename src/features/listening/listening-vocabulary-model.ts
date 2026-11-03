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
const irregularForms: Record<string, string> = {
  be: 'am is are was were been being',
  go: 'goes went gone going',
  do: 'does did done doing',
  have: 'has had having',
  make: 'made making',
  take: 'took taken taking',
  get: 'got gotten getting',
  come: 'came coming',
  see: 'saw seen seeing',
  say: 'said saying',
  give: 'gave given giving',
  find: 'found finding',
  think: 'thought thinking',
  know: 'knew known knowing',
  write: 'wrote written writing',
  read: 'reading',
  run: 'ran running',
  eat: 'ate eaten eating',
  drink: 'drank drunk drinking',
  buy: 'bought buying',
  bring: 'brought bringing',
  speak: 'spoke spoken speaking',
  leave: 'left leaving',
  feel: 'felt feeling',
  keep: 'kept keeping',
  sleep: 'slept sleeping',
  child: 'children',
  person: 'people',
  man: 'men',
  woman: 'women',
  foot: 'feet',
  tooth: 'teeth',
  mouse: 'mice'
}
/** 生成保守的常见变形候选
 * @param english 文档中的英文词条
 * @returns 允许自动对应的词形集合
 */
const wordForms = (english: string) => {
  const base = english.trim().toLowerCase().replaceAll('’', "'")
  const forms = new Set([base, `${base}s`, ...(irregularForms[base]?.split(' ') || [])])
  if (/(?:s|x|z|ch|sh|o)$/.test(base)) forms.add(`${base}es`)
  if (/[^aeiou]y$/.test(base)) {
    forms.add(`${base.slice(0, -1)}ies`)
    forms.add(`${base.slice(0, -1)}ied`)
  }
  if (base.endsWith('e')) {
    forms.add(`${base}d`)
    forms.add(`${base.slice(0, -1)}ing`)
  } else {
    forms.add(`${base}ed`)
    forms.add(`${base}ing`)
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(base)) {
    forms.add(`${base}${base.at(-1)}ed`)
    forms.add(`${base}${base.at(-1)}ing`)
  }
  if (base.endsWith('ie')) forms.add(`${base.slice(0, -2)}ying`)
  return forms
}
/** 归一化原句中的排版空白和弯引号，保留正文原始偏移
 * @param quote 文档原句或正文原句
 * @returns 用于比较的原句文本
 */
const normalizedQuote = (quote: string) =>
  quote.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().replace(/\s+/gu, ' ')
/** 将文档原句自动对应到当前正文中的真实词形
 * @param body 当前英文正文
 * @param item 保持独立义项的词条及文档原句
 * @returns 当前正文的真实来源，无法明确匹配时返回空值
 */
export const resolveVocabularySource = (body: string, item: VocabularyWord) => {
  if (item.source && !vocabularyErrors(body, [item]).length) return item.source
  const hint = item.source_hint || item.source?.quote
  const forms = wordForms(item.english)
  const sentences = sentenceOptions(body)
  const selected =
    item.source &&
    sentences.find(
      (sentence) =>
        sentence.start === item.source!.start &&
        sentence.end === item.source!.end &&
        sentence.quote === item.source!.quote
    )
  const candidates = (selected ? [selected] : sentences)
    .filter((sentence) => !hint || normalizedQuote(sentence.quote) === normalizedQuote(hint))
    .flatMap((sentence) => {
      const tokens = wordOptions(body, sentence)
      const exact = tokens.filter(
        (token) => token.word.toLowerCase() === item.english.trim().toLowerCase()
      )
      const matches = exact.length
        ? exact
        : tokens.filter((token) => forms.has(token.word.toLowerCase().replaceAll('’', "'")))
      if (new Set(matches.map((token) => token.word.toLowerCase())).size > 1) return []
      return matches.map((token) => ({ ...sentence, ...token, confirmed: true }))
    })
  return candidates.length && (hint || candidates.length === 1) ? candidates[0]! : null
}
/** 校验词汇资料及其当前正文来源，空词汇仍允许发布
 * @param body 当前英文正文
 * @param words 保持独立义项和顺序的词汇条目
 * @returns 需要管理员处理的字段问题
 */
export const vocabularyErrors = (body: string, words: VocabularyWord[]) =>
  words.flatMap((item, index) => {
    const errors: string[] = [],
      source = item.source || (item.source_hint ? resolveVocabularySource(body, item) : null),
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
    return errors.map((message) => `词汇${index + 1}：${message}`)
  })

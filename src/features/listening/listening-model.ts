import type { ArticlePayload, TimelineWord } from './listening-types'

import { phraseHighlights } from './phrase-highlights'

/** 创建不补造业务资料的空草稿
 * @returns 待管理员录入的资料
 */
export const emptyPayload = (): ArticlePayload => ({
  title_zh: '',
  title_en: '',
  tags: [],
  body_en: '',
  translation_zh: '',
  expressions: Array.from({ length: 5 }, () => ({ english: '', chinese: '', example: '' })),
  word_meanings: [],
  audio_id: null,
  image_id: null
})
/** 提示本地已知的必填缺项，音频就绪及最终校验仍以服务端为准
 * @param payload 当前编辑资料
 * @param topicId 已确认的主题归属
 * @returns 可定位的缺项说明
 */
export const publishErrors = (payload: ArticlePayload, topicId: string): string[] => [
  ...(!topicId ? ['请选择有效主题'] : []),
  ...(!payload.title_zh.trim() ? ['请填写中文标题'] : []),
  ...(!payload.title_en.trim() ? ['请填写英文标题'] : []),
  ...(!payload.body_en.trim() ? ['请填写英文正文'] : []),
  ...(!payload.translation_zh.trim() ? ['请填写全文中文译文'] : []),
  ...(payload.expressions.length !== 5 ||
  payload.expressions.some(
    (item) => !item.english.trim() || !item.chinese.trim() || !item.example.trim()
  )
    ? ['需要恰好5组完整表达、中文释义和替换例句']
    : []),
  ...(!payload.audio_id ? ['请上传完整英文音频'] : [])
]
/** 区分候选的移除资格及保存资格
 * @param candidates 当前服务端暂存候选
 * @param selectedIds 管理员明确勾选的编号
 * @returns 真实有效选择、可保存与可移除的范围
 */
export const candidateSelection = (
  candidates: { id: string; state: string; removed: boolean }[],
  selectedIds: string[]
) => {
  const selected = candidates.filter((item) => !item.removed && selectedIds.includes(item.id))
  const save = selected
    .filter((item) => ['complete', 'incomplete'].includes(item.state))
    .map((item) => item.id)
  return {
    selected: selected.map((item) => item.id),
    save,
    publish: selected.filter((item) => item.state === 'complete').map((item) => item.id),
    remove: selected.filter((item) => item.state !== 'saved').map((item) => item.id),
    excluded: selected.length - save.length
  }
}
/** 调整一套完整顺序中的单篇位置，保持另一套顺序独立
 * @param ids 当前完整编号集合
 * @param id 待移动文章
 * @param direction 向前为-1，向后为1
 * @returns 调整后的新集合
 */
export const moveArticle = (ids: string[], id: string, direction: number) => {
  const result = [...ids],
    index = result.indexOf(id),
    target = index + direction
  if (index >= 0 && target >= 0 && target < result.length)
    [result[index], result[target]] = [result[target]!, result[index]!]
  return result
}
/** 用当前媒体时钟计算码点字符与短尾迹，不使用独立动画
 * @param body 未改写的英文原文
 * @param words 经服务端校验的词时间轴
 * @param position 当前音频秒数
 * @param phrases 正文表达顺序
 * @returns 原始字符与当前位置样式
 */
export const timelineCharacters = (
  body: string,
  words: TimelineWord[],
  position: number,
  phrases: string[] = []
) => {
  const frame = characterFrame(words, position * 1000, false),
    ranges = phraseHighlights(body, phrases)
  return [...body].map((text, index) => ({
    text,
    active: index === frame.current,
    trail: frame.trails.some((item) => item.position === index),
    opacity: frame.trails.find((item) => item.position === index)?.strength || 0,
    background: ranges.find((item) => index >= item.start && index < item.end)?.color
  }))
}
/** 按媒体毫秒计算逐字高亮和短尾迹
 * @param words 已校验时间轴
 * @param milliseconds 媒体毫秒
 * @param ended 播放结束状态
 * @returns 当前字符和尾迹
 */
const characterFrame = (words: TimelineWord[], milliseconds: number, ended: boolean) => {
  const frame: {
    current: number
    fraction: number
    trails: { position: number; strength: number }[]
  } = { current: -1, fraction: 0, trails: [] }
  if (ended || !words.length) return frame
  const index = words.findIndex(
    (word) => milliseconds >= word.start_ms && milliseconds < word.end_ms
  )
  const previous = words.reduce(
    (found, word, index) => (word.end_ms <= milliseconds ? index : found),
    -1
  )
  const anchor = index >= 0 ? index : previous
  const active = words[anchor]
  if (!active) return frame
  if (index >= 0) {
    const progress =
      ((milliseconds - active.start_ms) / (active.end_ms - active.start_ms)) *
      (active.end - active.start)
    frame.current = active.start + Math.floor(progress)
    frame.fraction = progress - Math.floor(progress)
  }
  for (let i = Math.max(0, anchor - 2 + 1); i <= anchor; i++) {
    const word = words[i]!
    if (word.sentence_id !== active.sentence_id) continue
    for (let position = word.start; position < word.end; position++) {
      const end =
        word.start_ms +
        ((position - word.start + 1) / (word.end - word.start)) * (word.end_ms - word.start_ms)
      const age = milliseconds - end
      if (age >= 0 && age < 550) frame.trails.push({ position, strength: 1 - age / 550 })
    }
  }
  return frame
}
export const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线',
  deleted: '已删除',
  complete: '资料完整',
  incomplete: '待补充',
  unreadable: '无法读取',
  duplicate: '自动跳过',
  saved: '已保存',
  pending: '等待生成',
  processing: '生成中',
  ready: '可用',
  needs_attention: '需处理',
  failed: '失败',
  missing: '暂无时间轴'
}
export const importErrorLabels: Record<string, string> = {
  'topic_id:confirmation_required':
    '文章所属主题待确认，请点击“核对 / 补充资料”，选择所属主题后保存到本批暂存',
  'title_zh:required_for_publish': '中文标题待补充，请在“核对 / 补充资料”中填写',
  'title_en:required_for_publish': '英文标题待补充，请在“核对 / 补充资料”中填写',
  'body_en:required_for_publish': '英文正文待补充，请在“核对 / 补充资料”中填写',
  'translation_zh:required_for_publish': '全文中文译文待补充，请在“核对 / 补充资料”中填写',
  'expressions:five_complete_required_for_publish':
    '表达资料待补充，发布前需填写完整的5组英文表达、中文释义和替换例句',
  'audio_id:selection_required': '完整英文音频待确认，请在“核对 / 补充资料”中选择配套音频',
  listening_docx_missing: '未找到可读取的听读DOCX资料，请检查压缩包中是否包含.docx文件',
  listening_target_duplicate: '本批多项选择了同一目标，请分别选择目标后重试',
  listening_import_snapshot_changed: '候选资料与原确认不同，请返回重新核对',
  listening_article_changed: '目标草稿已在其他窗口修改，请重新选择目标并核对差异',
  listening_article_deleted: '目标文章已删除，本次没有更新，请重新选择目标',
  listening_article_missing: '目标文章已不可用，本次没有更新，请重新选择目标',
  listening_media_reference_invalid: '素材归属无效，请重新选择本候选或目标现有素材',
  listening_word_reference_invalid: '正文关联词义位置已变化，请核对后重试'
}

/** 展示英文优先主题名，兼容历史主题且不制造空行
 * @param topic 当前主题双语名称
 * @param topic.name_en 英文主题名称
 * @param topic.name 中文或历史名称
 * @returns 可读的主题名称
 */
export const topicLabel = (topic: { name_en?: string; name: string }) =>
  [topic.name_en, topic.name].filter(Boolean).join(' / ')

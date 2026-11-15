export type ContentType = 'illustrated' | 'intensive'
export const contentTypeLabels = { illustrated: '图解词汇', intensive: '精读词汇' }
/** 校验手动页码，保留调用者的原始输入
 * @param raw 管理员填写的十进制页码
 * @param totalPages 当前组合响应提供的有效总页数
 * @returns 规范化的目标页码
 */
export const parsePageTarget = (raw: string, totalPages: number) => {
  const text = raw.trim()
  const value = Number(text)
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > totalPages)
    throw new Error(`请输入1至${totalPages}的整数页码`)
  return value
}
/** 根据明确类型与候选附件显示发布阻止原因
 * @param type 管理员明确选择的类型，空值表示待补
 * @param hasPdf 当前候选是否有有效PDF
 * @param blocked 附件是否尚未处理成功
 * @returns 发布阻止原因，合法时为空
 */
export const typeIssue = (
  type: ContentType | null | undefined,
  hasPdf: boolean,
  blocked = false
) => {
  if (!type) return '待补类型：请选择图解词汇或精读词汇，仍可保存草稿'
  if (type === 'illustrated' && (hasPdf || blocked))
    return '类型与PDF冲突：请改选精读词汇，或明确移除PDF'
  if (type === 'intensive' && (!hasPdf || blocked)) return '精读词汇发布前须上传并校验有效PDF'
  return ''
}

export const sourceReasonLabels: Record<string, string> = {
  source_hint_conflict: '资料原句与正文冲突',
  source_ambiguous: '词形来源有歧义',
  source_sense_conflict: '不同义项来源冲突',
  source_unmatched: '当前正文未找到可靠词形'
}

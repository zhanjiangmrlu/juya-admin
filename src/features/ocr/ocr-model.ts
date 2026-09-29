/**
 * 将显式接受的 OCR 候选字段合并到人工版本
 *
 * @param manual - 当前人工版本
 * @param candidate - OCR 候选字段
 * @param fields - 管理员明确接受的字段名
 * @returns 仅替换选中字段的新人工版本
 */
export function mergeAcceptedOcrFields<T extends object>(
  manual: T,
  candidate: Partial<T>,
  fields: readonly (keyof T)[]
): T {
  const next = { ...manual }
  for (const field of fields) {
    if (field in candidate) next[field] = candidate[field] as T[keyof T]
  }
  return next
}

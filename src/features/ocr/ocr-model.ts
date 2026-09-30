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

export interface OcrJob {
  errorCode: null | string
  id: string
  providerRequestId: null | string
  status: string
  targetId: string
  updatedAt: string
}

export interface OcrCandidate {
  confidence: null | number
  confirmedRevisionId: null | string
  content: Record<string, unknown>
  id: string
  status: string
  templateType: string
}

export interface OcrConfirmation {
  revisionId: string
  revisionStatus: string
  version: number
}

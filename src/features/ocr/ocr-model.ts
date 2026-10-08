import { formatDateTime } from '@/shared/utils/date-time'

export const /**
   * 将 OCR 额度核验时间显示为北京时间，精确到秒
   * @param verifiedAt - 保存的核验时间，无时区的数据库时间按 UTC 处理
   * @param fallback - 未核验或时间无效时的显示文案
   * @returns YYYY-MM-DD HH:mm:ss 格式的核验时间或回退文案
   */
  formatOcrQuotaVerifiedAt = (verifiedAt: string | null, fallback = '尚未完成'): string => {
    if (!verifiedAt) return fallback
    const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(verifiedAt) ? verifiedAt : `${verifiedAt}Z`
    return formatDateTime(timestamp, fallback)
  }

export const /**
   * 根据服务端核验时间判断 OCR 免费额度是否已在本月核验
   * @param verifiedAt - 保存的核验时间，无时区的数据库时间按 UTC 处理
   * @param month - 服务端按北京时间计算的当前额度月份
   * @returns 核验时间是否属于当前额度月份
   */
  isOcrQuotaVerifiedThisMonth = (verifiedAt: string | null, month: string): boolean => {
    if (!verifiedAt) return false
    return formatOcrQuotaVerifiedAt(verifiedAt, '').slice(0, 7) === month
  }

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

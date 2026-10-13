import { ApiError } from '@/shared/errors/api-error'

import { issueFieldLabel } from './work-order-model'

export const /** 区分需要读取新基线的身份冲突与可补填业务错误
   * @param failure - 正式接口错误
   * @returns 是否必须对照新候选后继续
   */ isCorrectionConflict = (failure: unknown): boolean =>
    failure instanceof ApiError &&
    failure.status === 409 &&
    (failure.code.endsWith('_VERSION_CONFLICT') ||
      ['ENTRY_IDENTITY_CONFLICT', 'ENTRY_BASELINE_CONFLICT'].includes(failure.code))
const /** 提取供管理员对照的正文与元信息，不展示内部身份散列
   * @param value - 本地或服务端候选字段
   * @param path - 当前业务字段位置
   * @returns 可读字段值
   */ fields = (value: unknown, path = ''): Record<string, string> => {
    if (Array.isArray(value))
      return Object.assign({}, ...value.map((row, index) => fields(row, `${path}.${index}`)))
    if (value && typeof value === 'object')
      return Object.assign(
        {},
        ...Object.entries(value)
          .filter(([key]) => !/(^id$|_id$|_ids$|hash|version|schema|target|slice)/.test(key))
          .map(([key, row]) => fields(row, path ? `${path}.${key}` : key))
      )
    return { [path]: value == null || value === '' ? '（空）' : String(value) }
  }
export const /** 列出保留输入与当前候选的字段差异
   * @param local - 尚未写入的管理员输入
   * @param remote - 刚读取的服务端候选
   * @returns 双侧可核对的差异
   */ correctionDifferences = (
    local: unknown,
    remote: unknown
  ): { field: string; label: string; local: string; remote: string }[] => {
    const left = fields(local),
      right = fields(remote)
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((field) => left[field] !== right[field])
      .map((field) => ({
        field,
        label: issueFieldLabel([field]) || field,
        local: left[field] || '（无此项）',
        remote: right[field] || '（无此项）'
      }))
  }

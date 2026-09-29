import type { components } from '@/shared/contracts/generated/admin-api'

export type FormalEntitlementTerm = components['schemas']['EntitlementTerm']
export type FormalEntitlementOperation = components['schemas']['EntitlementOperation']
export type FormalEntitlementStatus = 'ACTIVE' | 'EXPIRED' | 'PAUSED' | 'REVOKED'

export const FORMAL_TERMS: readonly FormalEntitlementTerm[] = [
  'MONTH_1',
  'MONTH_2',
  'MONTH_3',
  'MONTH_6',
  'MONTH_12',
  'PERMANENT'
]

export const FORMAL_TERM_LABELS: Readonly<Record<FormalEntitlementTerm, string>> = {
  MONTH_1: '1 个自然月',
  MONTH_2: '2 个自然月',
  MONTH_3: '3 个自然月',
  MONTH_6: '6 个自然月',
  MONTH_12: '12 个自然月',
  PERMANENT: '永久有效'
}

export const FORMAL_OPERATION_LABELS: Readonly<Record<FormalEntitlementOperation, string>> = {
  GRANT: '授予',
  PAUSE: '暂停',
  RENEW: '续期',
  RESUME: '恢复',
  REVOKE: '撤销'
}

/**
 * 根据当前正式权益状态和期限返回前端可展示的操作
 *
 * @param status - 当前正式权益状态
 * @param term - 当前正式权益期限档位
 * @returns 按业务优先级排列的可用操作数组
 */
export function getFormalOperations(
  status: FormalEntitlementStatus,
  term: FormalEntitlementTerm
): readonly FormalEntitlementOperation[] {
  if (status === 'ACTIVE') {
    return term === 'PERMANENT' ? ['PAUSE', 'REVOKE'] : ['RENEW', 'PAUSE', 'REVOKE']
  }
  if (status === 'PAUSED') {
    return term === 'PERMANENT' ? ['RESUME', 'REVOKE'] : ['RENEW', 'RESUME', 'REVOKE']
  }
  return ['GRANT']
}

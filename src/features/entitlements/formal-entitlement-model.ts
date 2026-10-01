import type { components } from '@/shared/contracts/generated/admin-api'

export type FormalEntitlementTerm = components['schemas']['EntitlementTerm']
export type FormalEntitlementOperation = components['schemas']['EntitlementOperation']
export type FormalEntitlementStatus = 'ACTIVE' | 'EXPIRED' | 'PAUSED' | 'REVOKED'

export const FORMAL_TERMS: readonly FormalEntitlementTerm[] = [
  'month_1',
  'month_2',
  'month_3',
  'month_6',
  'month_12',
  'permanent'
]

export const FORMAL_TERM_LABELS: Readonly<Record<FormalEntitlementTerm, string>> = {
  month_1: '1 个自然月',
  month_2: '2 个自然月',
  month_3: '3 个自然月',
  month_6: '6 个自然月',
  month_12: '12 个自然月',
  permanent: '永久有效'
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
    return term === 'permanent' ? ['PAUSE', 'REVOKE'] : ['RENEW', 'PAUSE', 'REVOKE']
  }
  if (status === 'PAUSED') {
    return term === 'permanent' ? ['RESUME', 'REVOKE'] : ['RENEW', 'RESUME', 'REVOKE']
  }
  return ['GRANT']
}

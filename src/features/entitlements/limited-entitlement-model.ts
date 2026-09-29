export type LimitedEntitlementStatus =
  'ACTIVE' | 'EXPIRED' | 'PAUSED' | 'PENDING' | 'REVOKED' | 'START_EXPIRED'

export type LimitedEntitlementOperation =
  'EXTEND_START_DEADLINE' | 'GRANT' | 'PAUSE' | 'RESTORE_START_WINDOW' | 'RESUME' | 'REVOKE'

export interface LimitedOperationSource {
  remedyCount: number
  status: LimitedEntitlementStatus
}

export const LIMITED_OPERATION_LABELS: Readonly<Record<LimitedEntitlementOperation, string>> = {
  EXTEND_START_DEADLINE: '延长启动截止',
  GRANT: '开通',
  PAUSE: '暂停',
  RESTORE_START_WINDOW: '恢复启动窗口',
  RESUME: '恢复学习',
  REVOKE: '撤销'
}

/**
 * 根据限时权益状态与补救次数返回可展示操作
 *
 * @param entitlement - 当前状态和已使用补救次数
 * @returns 按业务优先级排列的可用操作数组
 */
export function getLimitedOperations(
  entitlement: LimitedOperationSource
): readonly LimitedEntitlementOperation[] {
  if (entitlement.status === 'ACTIVE') return ['PAUSE']
  if (entitlement.status === 'PAUSED') return ['RESUME', 'REVOKE']
  if (entitlement.status === 'PENDING') {
    return entitlement.remedyCount === 0 ? ['EXTEND_START_DEADLINE', 'REVOKE'] : ['REVOKE']
  }
  if (entitlement.status === 'START_EXPIRED') {
    return entitlement.remedyCount === 0 ? ['RESTORE_START_WINDOW', 'REVOKE'] : ['REVOKE']
  }
  return []
}

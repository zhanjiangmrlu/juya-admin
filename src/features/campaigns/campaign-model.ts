export type CampaignFieldMode = 'editable' | 'readonly'

export interface CampaignViewModel {
  hasGrantedEntitlements: boolean
}

export interface CampaignFieldAccess {
  activationWindow: CampaignFieldMode
  capacity: CampaignFieldMode
  duration: CampaignFieldMode
  name: CampaignFieldMode
  sceneOrder: CampaignFieldMode
}

export interface ValidationResult {
  message?: string
  valid: boolean
}

/**
 * 根据活动是否已首次开通返回字段编辑权限。
 *
 * @param campaign - 活动锁定状态视图模型。
 * @returns 各活动字段的可编辑或只读状态。
 */
export function getCampaignFieldAccess(campaign: CampaignViewModel): CampaignFieldAccess {
  const lockedMode: CampaignFieldMode = campaign.hasGrantedEntitlements ? 'readonly' : 'editable'
  return {
    activationWindow: lockedMode,
    capacity: 'editable',
    duration: lockedMode,
    name: 'editable',
    sceneOrder: lockedMode
  }
}

/**
 * 校验新容量不得小于当前已开通人数且必须为正整数。
 *
 * @param currentCount - 当前已经开通的权益人数。
 * @param nextLimit - 管理员拟设置的新容量。
 * @returns 容量是否合法及失败文案。
 */
export function validateCapacityLimit(currentCount: number, nextLimit: number): ValidationResult {
  if (!Number.isInteger(nextLimit) || nextLimit <= 0) {
    return { message: '容量必须为正整数', valid: false }
  }
  if (nextLimit < currentCount) {
    return { message: `容量不能小于已开通人数 ${currentCount}`, valid: false }
  }
  return { valid: true }
}

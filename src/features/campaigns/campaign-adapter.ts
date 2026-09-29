import { getCapability } from '@/shared/capabilities/capability-registry'

import type { CapabilityKey, CapabilityState } from '@/shared/capabilities/capability-registry'

export type CapabilityLookup = (key: CapabilityKey) => CapabilityState

export interface CampaignAdapter {
  canChangeCapacity: boolean
  canManage: boolean
  requestCount: 0
}

/**
 * 创建只暴露已声明能力边界的活动管理适配器
 *
 * @param lookup - 能力注册表查询函数
 * @returns 不发送未知请求的活动管理能力描述
 */
export function createCampaignAdapter(lookup: CapabilityLookup = getCapability): CampaignAdapter {
  return {
    canChangeCapacity: lookup('campaigns.capacity') === 'available',
    canManage: lookup('campaigns.manage') === 'available',
    requestCount: 0
  }
}

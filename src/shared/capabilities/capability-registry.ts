export type CapabilityState = 'available' | 'pending'

export type CapabilityKey = keyof typeof capabilityRegistry

const capabilityRegistry = {
  'analytics.export': 'available',
  'analytics.query': 'pending',
  'auth.logout': 'available',
  'auth.password': 'available',
  'auth.session-probe': 'available',
  'campaigns.capacity': 'pending',
  'campaigns.manage': 'pending',
  'contacts.copy-audit': 'pending',
  'contacts.correction-command': 'pending',
  'contacts.correction-list': 'pending',
  'content.batch-jobs': 'pending',
  'content.discovery-config': 'available',
  'content.edit': 'pending',
  'content.list': 'pending',
  'content.ocr': 'pending',
  'content.publish': 'available',
  'content.upload': 'available',
  'dashboard.read': 'available',
  'entitlements.formal-command': 'available',
  'entitlements.formal-preview': 'available',
  'entitlements.limited-command': 'available',
  'entitlements.list': 'pending',
  'feedback.command': 'available',
  'feedback.detail': 'available',
  'feedback.list': 'pending',
  'feedback.screenshot-url': 'pending',
  'settings.audit': 'available',
  'settings.read': 'available',
  'settings.update': 'available',
  'users.detail': 'available',
  'users.list': 'available',
  'users.wechat-search': 'available',
  'work-items.list': 'available'
} as const satisfies Record<string, CapabilityState>

/**
 * 返回指定管理端能力的当前接入状态
 *
 * @param key - 需要查询的能力标识
 * @returns 能力已接入或待接入状态
 */
export function getCapability(key: CapabilityKey): CapabilityState {
  return capabilityRegistry[key]
}

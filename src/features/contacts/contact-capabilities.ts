import { getCapability } from '@/shared/capabilities/capability-registry'

import type { ApiClient } from '@/services/api/api-client'

export type ContactCorrectionAction = 'approve' | 'reject'

export interface PendingContactResult {
  state: 'pending'
}

export interface ContactCapabilities {
  readonly canCopySensitiveValue: boolean
  submitCorrection(id: string, action: ContactCorrectionAction): Promise<PendingContactResult>
}

/**
 * 创建联系资料能力边界，待接入能力永远不发送未知请求
 *
 * @param _client - 预留的统一 API 客户端，当前无可调用命令
 * @returns 联系资料复制和更正命令能力对象
 */
export function createContactCapabilities(_client: ApiClient): ContactCapabilities {
  const canCopySensitiveValue = getCapability('contacts.copy-audit') === 'available'

  /**
   * 提交联系资料更正命令；接口待接入时只返回 pending
   *
   * @param _id - 联系资料更正申请编号
   * @param _action - 批准或拒绝动作
   * @returns 待接入状态，不发送网络请求
   */
  async function submitCorrection(
    _id: string,
    _action: ContactCorrectionAction
  ): Promise<PendingContactResult> {
    return { state: 'pending' }
  }

  return { canCopySensitiveValue, submitCorrection }
}

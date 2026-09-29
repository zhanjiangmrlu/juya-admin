export const CONFIG_KEYS = {
  expiryWarningDays: 'entitlement_expiry_warning_days',
  feedbackSlaHours: 'feedback_sla_hours',
  readonlyPreviewEnabled: 'readonly_preview_enabled',
  shadowingEnabled: 'shadowing_enabled',
  unentitledMaterialEntryEnabled: 'unentitled_material_entry_enabled'
} as const

export interface SystemConfigDraft {
  expiryWarningDays: number
  feedbackSlaHours: number
  readonlyPreviewEnabled: boolean
  shadowingEnabled: boolean
  unentitledMaterialEntryEnabled: boolean
}

export interface SystemConfigSnapshot {
  draft: SystemConfigDraft
  versions: Partial<Record<string, number>>
}

/**
 * 校验 SLA、到期阈值与三个审核开关
 *
 * @param config - 管理员配置草稿
 * @returns 配置校验结果
 */
export function validateSystemConfig(config: SystemConfigDraft): {
  message: string
  valid: boolean
} {
  if (
    !Number.isInteger(config.feedbackSlaHours) ||
    config.feedbackSlaHours < 1 ||
    config.feedbackSlaHours > 168
  )
    return { message: '反馈 SLA 必须为 1 到 168 小时', valid: false }
  if (
    !Number.isInteger(config.expiryWarningDays) ||
    config.expiryWarningDays < 1 ||
    config.expiryWarningDays > 90
  )
    return { message: '即将到期阈值必须为 1 到 90 天', valid: false }
  if (
    [
      config.shadowingEnabled,
      config.readonlyPreviewEnabled,
      config.unentitledMaterialEntryEnabled
    ].some((value) => typeof value !== 'boolean')
  )
    return { message: '审核开关必须为布尔值', valid: false }
  return { message: '校验通过', valid: true }
}

/**
 * 读取配置草稿字段对应的服务端值
 *
 * @param draft - 配置草稿
 * @param key - 服务端配置键
 * @returns 包装为 value 字段的配置值
 */
export function getConfigValue(draft: SystemConfigDraft, key: string): Record<string, unknown> {
  const field = (Object.entries(CONFIG_KEYS) as [keyof SystemConfigDraft, string][]).find(
    ([, configKey]) => configKey === key
  )?.[0]
  if (!field) throw new Error(`未知配置键：${key}`)
  return { value: draft[field] }
}

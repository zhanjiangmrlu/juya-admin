import type { SystemConfigDraft, SystemConfigSnapshot } from './system-config-model'
import type { ApiClient } from '@/services/api/api-client'

import { CONFIG_KEYS } from './system-config-model'

export interface SystemConfigEntry {
  key: string
  value: Record<string, unknown>
  version: number
}
export interface SystemConfigAdapter {
  load(): Promise<SystemConfigSnapshot>
  update(
    key: string,
    value: Record<string, unknown>,
    expectedVersion: number
  ): Promise<SystemConfigEntry>
}

/**
 * 创建系统配置读取和乐观锁更新适配器
 *
 * @param client - 统一 API 客户端
 * @returns 系统配置适配器
 */
export function createSystemConfigAdapter(client: ApiClient): SystemConfigAdapter {
  return {
    /**
     * 加载并映射系统配置列表
     *
     * @returns 配置草稿与各键版本
     */
    async load() {
      const response = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/settings'
      })
      return parseSnapshot(response)
    },
    /**
     * 使用期望版本更新单个配置键
     *
     * @param key - 服务端配置键
     * @param value - 新配置值
     * @param expectedVersion - 读取时的期望版本
     * @returns 更新后的配置项
     */
    async update(key, value, expectedVersion) {
      const response = await client.request<unknown>({
        body: { expected_version: expectedVersion, value },
        method: 'PATCH',
        path: `/api/v1/admin/settings/${encodeURIComponent(key)}`
      })
      return parseEntry(response)
    }
  }
}

/**
 * 校验并映射配置列表响应
 *
 * @param source - 服务端配置列表响应
 * @returns 配置快照
 */
function parseSnapshot(source: unknown): SystemConfigSnapshot {
  if (!isRecord(source) || !Array.isArray(source.items)) throw new Error('系统配置响应格式不正确')
  const entries = source.items.map(parseEntry)
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  /**
   * 读取并校验指定配置键的基础值
   *
   * @param key - 服务端配置键
   * @param type - 期望基础类型
   * @returns 已校验配置值
   */
  function read<T extends boolean | number>(key: string, type: 'boolean' | 'number'): T {
    const value = byKey.get(key)?.value.value
    if (typeof value !== type) throw new Error(`系统配置缺少字段：${key}`)
    return value as T
  }
  const draft: SystemConfigDraft = {
    expiryWarningDays: read(CONFIG_KEYS.expiryWarningDays, 'number'),
    feedbackSlaHours: read(CONFIG_KEYS.feedbackSlaHours, 'number'),
    readonlyPreviewEnabled: read(CONFIG_KEYS.readonlyPreviewEnabled, 'boolean'),
    shadowingEnabled: read(CONFIG_KEYS.shadowingEnabled, 'boolean'),
    unentitledMaterialEntryEnabled: read(CONFIG_KEYS.unentitledMaterialEntryEnabled, 'boolean')
  }
  return { draft, versions: Object.fromEntries(entries.map((entry) => [entry.key, entry.version])) }
}

/**
 * 校验并映射单个配置项
 *
 * @param source - 服务端配置项响应
 * @returns 配置项
 */
function parseEntry(source: unknown): SystemConfigEntry {
  if (
    !isRecord(source) ||
    typeof source.key !== 'string' ||
    !isRecord(source.value) ||
    typeof source.version !== 'number'
  )
    throw new Error('系统配置项格式不正确')
  return { key: source.key, value: source.value, version: source.version }
}

/**
 * 判断未知值是否为普通记录对象
 *
 * @param value - 需要判断的未知值
 * @returns 是否为普通记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

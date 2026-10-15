import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

import { LEARNING_MODULE_LABELS } from './discovery-model'

export interface LearningModuleRow {
  type: string
  name: string
  order: number
  enabled: boolean
  version: number
  ready: boolean
  reason: string | null
  entryPath: string
}
export interface LearningModulesAdapter {
  load(): Promise<LearningModuleRow[]>
  save(row: LearningModuleRow, key: string): Promise<LearningModuleRow>
}
const base = '/api/v1/admin/content/learning-modules'
/**
 * 校验并映射实际模块配置与只读就绪状态
 * @param value - 服务端模块行
 * @returns 单独版本的配置行
 */
const parse = (value: unknown): LearningModuleRow => {
  const row = value as Record<string, unknown> | null
  if (
    !row ||
    typeof row.module_type !== 'string' ||
    !Object.hasOwn(LEARNING_MODULE_LABELS, row.module_type) ||
    typeof row.display_name !== 'string' ||
    typeof row.enabled !== 'boolean' ||
    typeof row.ready !== 'boolean' ||
    !Number.isInteger(row.config_version) ||
    Number(row.config_version) < 1 ||
    !Number.isInteger(row.sort_order)
  )
    throw new Error('学习模块响应缺少有效配置或就绪状态')
  return {
    type: row.module_type,
    name: row.display_name,
    order: Number(row.sort_order),
    enabled: row.enabled,
    version: Number(row.config_version),
    ready: row.ready,
    reason: typeof row.reason === 'string' ? row.reason : null,
    entryPath: String(row.entry_path || '')
  }
}
/**
 * 创建已提交模块元信息契约的消费者
 * @param client - 已认证管理客户端
 * @returns 实际读取、单模块 CAS 保存与能力状态
 */
export const createLearningModulesAdapter = (client: ApiClient) => ({
  available: hasAdminOperation(base, 'get') && hasAdminOperation(`${base}/{module_type}`, 'put'),
  /** 读取按全局顺序返回的实际模块
   * @returns 服务端模块行
   */ load: async (): Promise<LearningModuleRow[]> => {
    const result = await client.request<{ items: unknown[] }>({ method: 'GET', path: base })
    if (!Array.isArray(result.items)) throw new Error('学习模块列表响应无效')
    const rows = result.items.map(parse)
    if (new Set(rows.map((row) => row.type)).size !== rows.length)
      throw new Error('学习模块类型重复')
    return rows
  },
  /**
   * 只提交名称、顺序与启用状态，禁止写入服务端就绪或入口
   * @param row - 管理员编辑的当前模块
   * @param key - 失败重试复用身份
   * @returns 服务端实际配置与新版本
   */ save: async (row: LearningModuleRow, key: string): Promise<LearningModuleRow> =>
    parse(
      await client.request({
        method: 'PUT',
        path: `${base}/${encodeURIComponent(row.type)}`,
        headers: { 'Idempotency-Key': key },
        body: {
          expected_version: row.version,
          display_name: row.name.trim(),
          sort_order: row.order,
          enabled: row.enabled
        }
      })
    )
})

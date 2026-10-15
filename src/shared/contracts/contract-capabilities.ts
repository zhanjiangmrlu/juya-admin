import openapi from '../../../openapi/admin-api.json'

/**
 * 只启用实际后端 OpenAPI 已装配的操作
 * @param path - OpenAPI 公开路由模板
 * @param method - 需要使用的 HTTP 方法
 * @returns 对应服务操作是否存在
 */
export const hasAdminOperation = (path: string, method: string): boolean => {
  const operation = (openapi.paths as Record<string, Record<string, unknown>>)[path]
  return !!operation && Object.hasOwn(operation, method.toLowerCase())
}

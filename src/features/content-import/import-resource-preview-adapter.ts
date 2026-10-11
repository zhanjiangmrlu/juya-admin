import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

export interface ImportResourcePreview {
  url: string
  contentType: string
  expiresAt: string
  sha256: string
}
export const /**
   * 读取管理员短期素材预览；路径只作为服务端明确查找键
   * @param client - 当前认证管理客户端
   * @returns 受控素材预览命令
   */ createImportResourcePreviewAdapter = (client: ApiClient) => ({
    available: hasAdminOperation(
      '/api/v1/admin/content-imports/{batch_id}/resources/preview',
      'post'
    ),
    /**
     * 服务端验证归属、原字节和真实类型后返回短期地址
     * @param batchId - 已校验内容或独立素材批次
     * @param resourcePath - 服务端清单中的明确文件路径
     * @param signal - 离页取消信号
     * @returns 原始素材预览，不作为已审核或已发布事实
     */ preview: async (
      batchId: string,
      resourcePath: string,
      signal?: AbortSignal
    ): Promise<ImportResourcePreview> => {
      const row = await client.request<{
        url: string
        content_type: string
        expires_at: string
        sha256: string
      }>({
        method: 'POST',
        path: `/api/v1/admin/content-imports/${encodeURIComponent(batchId)}/resources/preview`,
        body: { path: resourcePath },
        signal
      })
      if (
        !row.url ||
        !/^(image\/(png|jpeg|webp)|audio\/)/.test(row.content_type) ||
        !Number.isFinite(Date.parse(row.expires_at)) ||
        Date.parse(row.expires_at) <= Date.now()
      )
        throw new Error('素材预览响应缺少有效地址、类型或期限')
      return {
        url: row.url,
        contentType: row.content_type,
        expiresAt: row.expires_at,
        sha256: row.sha256
      }
    }
  })

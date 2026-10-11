import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

export type CatalogueItem = components['schemas']['CatalogueItem']
export type CataloguePage = components['schemas']['CataloguePage']
export interface CatalogueFilters {
  page: number
  pageSize: number
  query: string
  seriesId: string
  contentType: '' | 'dialogue' | 'word_card' | 'short_reading'
  status: '' | 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
}

export const /**
   * 读取服务端统一目录，过滤全部内容后分页，避免各类型当前页拼接造成漏项
   * @param client - 已认证的管理客户端
   * @returns 三模板共用的目录读取接口
   */
  createCatalogueAdapter = (client: ApiClient) => ({
    /**
     * 查询双语标题、类型、分类和上线状态
     * @param filters - 管理员当前筛选和分页条件
     * @param signal - 离页或新查询时取消旧请求的信号
     * @returns 服务端筛选后统计的完整分页结果
     */
    list: (filters: CatalogueFilters, signal?: AbortSignal): Promise<CataloguePage> =>
      client.request<CataloguePage>({
        method: 'GET',
        path: '/api/v1/admin/content/catalogue',
        signal,
        query: {
          page: filters.page,
          page_size: filters.pageSize,
          query: filters.query || undefined,
          content_type: filters.contentType || undefined,
          series_id: filters.seriesId || undefined,
          status: filters.status || undefined
        }
      })
  })

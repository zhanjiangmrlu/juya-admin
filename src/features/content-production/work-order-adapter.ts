import { createIdempotencyKey } from '@/services/api/api-client'

import type { CandidateDecision, ProductionSchema as S } from './work-order-model'
import type { ApiClient, ApiRequestOptions } from '@/services/api/api-client'

const base = '/api/v1/admin/content-production/work-orders'
type WithDefaults<T> = Omit<
  T,
  | 'scope'
  | 'include_recommendations'
  | 'text_checked'
  | 'images_checked'
  | 'audio_listened'
  | 'accept_normal_results'
  | 'allow_abnormal_drafts'
> &
  Partial<
    Pick<
      T,
      Extract<
        keyof T,
        | 'scope'
        | 'include_recommendations'
        | 'text_checked'
        | 'images_checked'
        | 'audio_listened'
        | 'accept_normal_results'
        | 'allow_abnormal_drafts'
      >
    >
  >
export type WorkCommandRequests = {
  sampling: WithDefaults<S['ScopedRequest']>
  'sample-actions': WithDefaults<S['SampleActionRequest']>
  organize: WithDefaults<S['OrganizeRequest']>
  'candidate-decisions': Omit<WithDefaults<S['CandidateDecisionRequest']>, 'decisions'> & {
    decisions: CandidateDecision[]
  }
  'candidate-dismissals': WithDefaults<S['CandidateDismissalRequest']>
  'entry-confirmations': WithDefaults<S['EntryConfirmationRequest']>
  'import-confirm': WithDefaults<S['ImportConfirmRequest']>
  'import-retry': WithDefaults<S['ImportConfirmRequest']>
  'publication-preview': WithDefaults<S['ScopedRequest']>
  'publication-confirm': WithDefaults<S['PublicationConfirmRequest']>
  'publication-retry': WithDefaults<S['PublicationConfirmRequest']>
  'stage-retry': WithDefaults<
    S['juya_admin_api__modules__content_production__schemas__StageRetryRequest']
  >
  cancel: WithDefaults<S['ScopedRequest']>
}
export type WorkCommand = keyof WorkCommandRequests
export type WorkCommandFields<K extends WorkCommand> = Omit<
  WorkCommandRequests[K],
  'expected_version'
>
const /** 拼接工作单所属资源路径
   * @param orderId - 当前工作单
   * @param suffix - 所属资源相对路径
   * @returns 安全编码路径
   */
  path = (orderId: string, suffix = ''): string => `${base}/${encodeURIComponent(orderId)}${suffix}`
export const /** 建立工作单正式契约适配
   * @param client - 已认证客户端
   * @returns 工作单接口集合
   */
  createWorkOrderAdapter = (client: ApiClient) => {
    const /** 执行有持久回执的写操作
       * @param url - 正式契约路径
       * @param body - 当前业务版本与明确范围
       * @param key - 同次重试复用的幂等键
       * @param method - 契约写入方式
       * @returns 服务端权威响应
       */
      write = <T>(
        url: string,
        body: unknown,
        key = createIdempotencyKey(),
        method: 'POST' | 'PUT' = 'POST'
      ): Promise<T> =>
        client.request({ method, path: url, body, headers: { 'Idempotency-Key': key } })
    const /** 读取当前权威数据
       * @param url - 正式读取路径
       * @param query - 分页或固定版本查询
       * @returns 服务端原始类型化数据
       */
      read = <T>(url: string, query?: ApiRequestOptions['query']): Promise<T> =>
        client.request({ method: 'GET', path: url, ...(query ? { query } : {}) })
    return {
      list: (page = 1, pageSize = 20) => read<S['OrderPage']>(base, { page, page_size: pageSize }),
      get: (id: string) => read<S['WorkOrder']>(path(id)),
      items: (id: string, page = 1, pageSize = 20, status = '') =>
        read<S['ItemPage']>(path(id, '/items'), {
          page,
          page_size: pageSize,
          status: status || undefined
        }),
      detail: (id: string, itemId: string) =>
        read<S['WorkItemDetail']>(path(id, `/items/${encodeURIComponent(itemId)}`)),
      preview: (id: string) => read<S['ImportPreview']>(path(id, '/import-preview')),
      candidates: (id: string) => read<S['CandidateGroups']>(path(id, '/candidates')),
      sampling: (id: string) => read<S['SamplingState']>(path(id, '/sampling')),
      publication: (id: string) => read<S['PublicationState']>(path(id, '/publication')),
      usage: (id: string) => read<S['WorkOrderUsage']>(path(id, '/usage')),
      phases: (id: string) => read<S['WorkOrderPhases']>(path(id, '/phases')),
      /** 通过共用认证层获取原上传文件字节
       * @param id - 文件所属工作单
       * @param signal - 离开当前页面时的取消信号
       * @returns 完整原始文件
       */ originalFile: (id: string, signal?: AbortSignal) =>
        client.request<Blob>({
          method: 'GET',
          path: path(id, '/original-file'),
          responseType: 'blob',
          signal
        }),
      bindings: (id: string, itemId: string, revisionId?: string) =>
        read<S['EntryBindings']>(path(id, `/items/${encodeURIComponent(itemId)}/entry-bindings`), {
          revision_id: revisionId
        }),
      fromBatch: (batchId: string) =>
        write<S['WorkOrder']>(`${base}/from-batch`, { batch_id: batchId }),
      manual: (body: S['ManualRequest'], key?: string) =>
        write<S['WorkOrder']>(`${base}/manual`, body, key),
      contexts: (body: S['ContextLookupRequest']) =>
        write<S['ContentContexts']>('/api/v1/admin/content-production/contexts', body),
      upload: (body: FormData, key?: string) => write<S['WorkOrder']>(base, body, key),
      command: <K extends WorkCommand>(
        id: string,
        action: K,
        body: WorkCommandRequests[K],
        key?: string
      ) => write<S['CommandResult']>(path(id, `/${action}`), body, key),
      correction: (id: string, itemId: string, body: S['CorrectionRequest'], key?: string) =>
        write<S['CommandResult']>(
          path(id, `/items/${encodeURIComponent(itemId)}/correction`),
          body,
          key,
          'PUT'
        ),
      /** 确认保存后重新读取的单条义项及来源
       * @param revisionId - 当前实际草稿版本
       * @param entryId - 保存后服务端返回的本篇词条身份
       * @param expectedVersion - 当前草稿编辑版本
       * @returns 正式单条人工确认结果
       */ confirmEntry: (revisionId: string, entryId: string, expectedVersion: number) =>
        write<unknown>(
          `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/entries/${encodeURIComponent(entryId)}/confirm`,
          {
            expected_version: expectedVersion,
            manual_checked: true
          } satisfies S['ManualEntryRequest']
        ),
      resume: (id: string, commandId: string) =>
        write<S['CommandResult']>(
          path(id, `/commands/${encodeURIComponent(commandId)}/resume`),
          undefined
        )
    }
  }

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

export const /** 仅排除工作单、内容、版本与正文 hash 完全匹配的冻结候选，统计其余当前草稿
   * @param state - 当前原发布范围的冻结候选
   * @param members - 当前工作单完整权威成员
   * @param complete - 是否已确认全部成员分页读取完整
   * @returns 当前保留草稿与其中需校对和处理失败数量，未完整读取时返回未知
   */ publicationDraftCounts = (
    state: S['PublicationState'],
    members: WorkItem[],
    complete: boolean
  ): { held: number; review: number; failed: number } | null => {
    if (!complete) return null
    const drafts = members.filter(
      (member) =>
        member.current_draft &&
        member.production_status !== 'published' &&
        !state.candidates.some(
          (candidate) =>
            member.work_order_id === state.work_order_id &&
            member.content_id === candidate.content_id &&
            member.revision_id === candidate.revision_id &&
            member.candidate_hash === candidate.candidate_hash
        )
    )
    return {
      held: drafts.length,
      review: drafts.filter((member) => member.production_status === 'review_required').length,
      failed: drafts.filter((member) => member.production_status === 'failed').length
    }
  }

export const /** 将冻结发布候选完整映射到本工作单成员，不使用当前勾选或动态合格范围
   * @param order - 当前权威工作单身份与类型
   * @param state - 原发布 token 的冻结候选与逐篇结果
   * @param members - 已完整分页读取的工作单成员
   * @param retry - 是否仅提交原范围明确失败项
   * @returns 精确待提交的成员编号
   */
  publicationItemIds = (
    order: WorkOrder,
    state: S['PublicationState'],
    members: WorkItem[],
    retry: boolean
  ): string[] => {
    const message = '发布范围与当前篇目不一致，请刷新权威状态并重新预览'
    if (state.work_order_id !== order.work_order_id || state.token !== order.publication_token)
      throw new Error(message)
    if (
      retry
        ? ['PREVIEW', 'QUEUED', 'RUNNING'].includes(state.status)
        : state.status !== 'PREVIEW' || state.results.length > 0
    )
      throw new Error(message)
    const candidates = new Map(state.candidates.map((row) => [row.revision_id, row]))
    if (!candidates.size || candidates.size !== state.candidates.length) throw new Error(message)
    if (
      new Set(state.results.map((row) => row.revision_id)).size !== state.results.length ||
      state.results.some((row) => !candidates.has(row.revision_id))
    )
      throw new Error(message)
    const targets = retry
      ? state.results
          .filter((row) => row.status === 'FAILED')
          .map((row) => candidates.get(row.revision_id)!)
      : state.candidates
    if (!targets.length) throw new Error(message)
    return targets.map((candidate) => {
      const matches = members.filter(
        (row) =>
          row.work_order_id === order.work_order_id &&
          candidate.content_type === order.content_type &&
          row.content_id === candidate.content_id &&
          row.revision_id === candidate.revision_id
      )
      const member = matches[0]
      if (
        matches.length !== 1 ||
        !member ||
        member.candidate_hash !== candidate.candidate_hash ||
        member.content_version !== candidate.expected_version ||
        (candidate.expected_edit_version != null &&
          member.edit_version !== candidate.expected_edit_version)
      )
        throw new Error(message)
      return member.item_id
    })
  }

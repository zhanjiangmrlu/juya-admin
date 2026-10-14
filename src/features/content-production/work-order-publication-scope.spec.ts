import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import { publicationDraftCounts, publicationItemIds } from './work-order-publication-scope'

const order = {
  work_order_id: 'order',
  content_type: 'short_reading',
  publication_token: 'token'
} as WorkOrder
const member = {
  item_id: 'A',
  work_order_id: 'order',
  content_id: 'a',
  revision_id: 'r-a',
  candidate_hash: 'hash',
  content_version: 4,
  edit_version: 2,
  publishable: false
} as WorkItem
const candidate = {
  content_type: 'short_reading',
  content_id: 'a',
  revision_id: 'r-a',
  candidate_hash: 'hash',
  expected_version: 4,
  expected_edit_version: 2,
  warning_codes: []
} as S['PublicationCandidate-Output']
const state = {
  work_order_id: 'order',
  token: 'token',
  status: 'PREVIEW',
  candidates: [candidate],
  results: []
} as unknown as S['PublicationState']

describe('冻结发布候选映射', () => {
  it('剩余草稿使用全量当前成员，旧已发布内容的新草稿仍计入，冻结失败不重复算处理失败', () => {
    const members = [
      { ...member, current_draft: true, production_status: 'failed' },
      {
        ...member,
        item_id: 'old',
        revision_id: 'old-published',
        current_draft: false,
        production_status: 'published',
        published: true
      },
      {
        ...member,
        item_id: 'new',
        revision_id: 'new-draft',
        current_draft: true,
        production_status: 'review_required',
        published: true
      },
      ...Array.from({ length: 21 }, (_, index) => ({
        ...member,
        item_id: `failed-${index}`,
        revision_id: `failed-${index}`,
        current_draft: true,
        production_status: 'failed'
      })),
      {
        ...member,
        item_id: 'normal',
        revision_id: 'normal',
        current_draft: true,
        production_status: 'normal'
      },
      {
        ...member,
        item_id: 'cancelled',
        revision_id: 'cancelled',
        current_draft: true,
        production_status: 'cancelled'
      }
    ] as WorkItem[]
    expect(publicationDraftCounts(state, members, true)).toEqual({
      held: 24,
      review: 1,
      failed: 21
    })
    expect(publicationDraftCounts(state, members.slice(0, 20), false)).toBeNull()
  })
  it('不依赖动态 publishable 状态或额外成员，精确映射原预览', () => {
    expect(
      publicationItemIds(
        order,
        state,
        [member, { ...member, item_id: 'B', revision_id: 'r-b' }],
        false
      )
    ).toEqual(['A'])
  })
  it('已提交无结果的范围不能重新确认，正在运行也不能重试旧失败项', () => {
    for (const status of ['QUEUED', 'RUNNING', 'PARTIAL', 'FAILED', 'SUCCEEDED'])
      expect(() => publicationItemIds(order, { ...state, status }, [member], false)).toThrow(
        '重新预览'
      )
    for (const status of ['QUEUED', 'RUNNING', 'PREVIEW'])
      expect(() =>
        publicationItemIds(
          order,
          { ...state, status, results: [{ revision_id: 'r-a', status: 'FAILED' }] },
          [member],
          true
        )
      ).toThrow('重新预览')
  })
  it.each([
    { content_id: 'other' },
    { revision_id: 'other' },
    { candidate_hash: 'changed' },
    { content_version: 5 },
    { edit_version: 3 },
    { work_order_id: 'foreign' }
  ])('拒绝不匹配成员 %j', (change) => {
    expect(() => publicationItemIds(order, state, [{ ...member, ...change }], false)).toThrow(
      '重新预览'
    )
  })
  it('不猜测缺失或多义成员，也不提交已证明范围的部分交集', () => {
    for (const members of [[], [member, { ...member, item_id: 'duplicate' }]])
      expect(() => publicationItemIds(order, state, members, false)).toThrow('重新预览')
    expect(() =>
      publicationItemIds(
        order,
        { ...state, candidates: [candidate, { ...candidate, revision_id: 'missing' }] },
        [member],
        false
      )
    ).toThrow('重新预览')
  })
  it('拒绝异类型、异工作单、异 token 及重复候选', () => {
    for (const changed of [
      { ...state, work_order_id: 'foreign' },
      { ...state, token: 'other' },
      { ...state, candidates: [{ ...candidate, content_type: 'dialogue' as const }] },
      { ...state, candidates: [candidate, candidate] }
    ])
      expect(() => publicationItemIds(order, changed, [member], false)).toThrow('重新预览')
  })
  it('仅重试原 token FAILED，UNKNOWN 与成功成员后来新草稿都不重发', () => {
    const retry = {
      ...state,
      status: 'PARTIAL',
      candidates: [
        candidate,
        { ...candidate, content_id: 'b', revision_id: 'r-b' },
        { ...candidate, content_id: 'c', revision_id: 'r-c' }
      ],
      results: [
        { revision_id: 'r-a', status: 'SUCCEEDED' },
        { revision_id: 'r-b', status: 'FAILED' },
        { revision_id: 'r-c', status: 'UNKNOWN' }
      ]
    }
    expect(
      publicationItemIds(
        order,
        retry,
        [
          { ...member, revision_id: 'a-new-draft' },
          { ...member, item_id: 'B', content_id: 'b', revision_id: 'r-b' },
          { ...member, item_id: 'C', content_id: 'c', revision_id: 'r-c' }
        ],
        true
      )
    ).toEqual(['B'])
    expect(() =>
      publicationItemIds(
        order,
        { ...retry, results: [{ revision_id: 'outside', status: 'FAILED' }] },
        [member],
        true
      )
    ).toThrow('重新预览')
    expect(() =>
      publicationItemIds(
        order,
        { ...retry, results: [{ revision_id: 'r-a', status: 'SUCCEEDED' }] },
        [member],
        true
      )
    ).toThrow('重新预览')
  })
})

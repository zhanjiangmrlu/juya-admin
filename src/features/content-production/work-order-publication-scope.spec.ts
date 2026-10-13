import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import { publicationItemIds } from './work-order-publication-scope'

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
  candidates: [candidate],
  results: []
} as unknown as S['PublicationState']

describe('冻结发布候选映射', () => {
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
  it('仅重试原 token FAILED/UNKNOWN，不因成功成员后来有新草稿而重发成功项', () => {
    const retry = {
      ...state,
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
    ).toEqual(['B', 'C'])
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

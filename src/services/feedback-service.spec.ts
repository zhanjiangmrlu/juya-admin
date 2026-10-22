import { beforeEach, expect, it, vi } from 'vitest'

import {
  createFeedbackReply,
  feedbackImageURL,
  readFeedbackDraft,
  saveFeedbackDraft
} from '@/services/feedback-service'
import { ApiError } from '@/services/http-client'

import type { FeedbackDetail } from '@/shared/types/feedback'

beforeEach(() => sessionStorage.clear())

it('freezes an unknown reply, queries first and explicitly retries the same body and key', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new ApiError('network_unknown', '未知'))
    .mockRejectedValueOnce(new ApiError('operation_unknown', '尚未查到', 404))
    .mockResolvedValueOnce({ id: 'one' } as FeedbackDetail)
  const operation = createFeedbackReply('one', {
    owner: () => 'admin',
    request,
    storage: sessionStorage
  })
  await expect(operation.send({ text: '原说明' })).rejects.toThrow('未知')
  const first = request.mock.calls[0]![1]
  await expect(operation.send({ text: '改后说明' })).rejects.toThrow('先查询')
  expect(request).toHaveBeenCalledTimes(1)
  expect(await operation.recover()).toBeNull()
  await operation.send({ text: '改后说明' })
  expect(request.mock.calls[2]![1]).toEqual({
    method: 'POST',
    key: first.key,
    body: { text: '原说明' }
  })
  expect(operation.pending()).toBe(false)
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('说明')
})

it('retains only owner-scoped operation metadata across recreation and blocks a changed owner', async () => {
  let owner: string | null = 'admin'
  const request = vi.fn().mockRejectedValue(new ApiError('network_unknown', '未知'))
  const ports = { owner: () => owner, request, storage: sessionStorage }
  const first = createFeedbackReply('one', ports)
  await expect(first.send({ text: '私密说明' })).rejects.toThrow()
  expect(createFeedbackReply('one', ports).pending()).toBe(true)
  owner = 'other'
  expect(createFeedbackReply('one', ports).pending()).toBe(false)
  await expect(first.recover()).rejects.toThrow('会话已变化')
  expect(request).toHaveBeenCalledTimes(1)
})

it('keeps drafts in memory, isolated by administrator and feedback', () => {
  saveFeedbackDraft('owner-one', 'draft', { text: '私密草稿', status: 'needs_info' })
  expect(readFeedbackDraft('owner-other', 'draft')).toBeNull()
  expect(readFeedbackDraft('owner-one', 'other')).toBeNull()
  const draft = readFeedbackDraft('owner-one', 'draft')!
  draft.text = '外部修改'
  expect(readFeedbackDraft('owner-one', 'draft')?.text).toBe('私密草稿')
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('私密草稿')
  saveFeedbackDraft('owner-one', 'draft', null)
  expect(readFeedbackDraft('owner-one', 'draft')).toBeNull()
})

it('uses only server-issued controlled screenshot paths', () => {
  expect(feedbackImageURL('/api/admin/v1/feedback/images/private-grant')).toMatch(
    '/api/admin/v1/feedback/images/private-grant'
  )
  expect(() => feedbackImageURL('https://example.test/private')).toThrow('截图地址暂不可用')
  expect(() => feedbackImageURL('//example.test/private')).toThrow()
})

it('does not discard recovery metadata when a successful response arrives after the owner changed', async () => {
  let owner = 'admin-one'
  let finish!: (value: FeedbackDetail) => void
  const request = vi.fn().mockImplementation(
    () =>
      new Promise<FeedbackDetail>((resolve) => {
        finish = resolve
      })
  )
  const operation = createFeedbackReply('late-owner', {
    owner: () => owner,
    request,
    storage: sessionStorage
  })
  const sending = operation.send({ text: '原管理员回复' })
  owner = 'admin-other'
  finish({ id: 'late-owner' } as FeedbackDetail)
  await expect(sending).rejects.toThrow('会话已变化')
  expect(operation.pending()).toBe(true)
  owner = 'admin-one'
  expect(
    createFeedbackReply('late-owner', {
      owner: () => owner,
      request,
      storage: sessionStorage
    }).pending()
  ).toBe(true)
})

it('retains the original key on fingerprint conflict and requires a receipt query instead of creating a duplicate', async () => {
  const accepted = { id: 'conflict-thread', latest_event_id: 2 } as FeedbackDetail
  const request = vi
    .fn()
    .mockRejectedValueOnce(new ApiError('network_unknown', '原回复结果未知'))
    .mockRejectedValueOnce(new ApiError('operation_unknown', '尚未查到', 404))
    .mockRejectedValueOnce(new ApiError('operation_conflict', '操作内容已变化', 409))
    .mockResolvedValueOnce({ status: 'succeeded', result: accepted })
  const ports = { owner: () => 'admin', request, storage: sessionStorage }
  const first = createFeedbackReply('conflict-thread', ports)
  await expect(
    first.send({ text: '原回复', status: 'resolved', expected_latest_event_id: 1 })
  ).rejects.toThrow('结果未知')
  const originalKey = request.mock.calls[0]![1].key
  const reopened = createFeedbackReply('conflict-thread', ports)
  expect(await reopened.recover()).toBeNull()
  await expect(
    reopened.send({ text: '原回复', status: 'resolved', expected_latest_event_id: 2 })
  ).rejects.toThrow('内容已变化')
  expect(reopened.pending()).toBe(true)
  expect(reopened.canRetry()).toBe(false)
  await expect(reopened.send({ text: '原回复' })).rejects.toThrow('先查询')
  expect(await reopened.recover()).toEqual(accepted)
  expect(request.mock.calls.at(-1)![0]).toBe(`/api/admin/v1/operations/${originalKey}`)
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2)
})

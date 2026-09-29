import { describe, expect, it, vi } from 'vitest'

import type { ApiClient, ApiRequestOptions } from '@/services/api/api-client'

import { copyContactValue, createContactCapabilities } from './contact-capabilities'

const correction = {
  created_at: '2026-09-29T08:00:00Z',
  id: 'CORRECTION-1',
  juya_number: 'JY000000000001',
  nickname: '学习者',
  processed_at: null,
  reason: '需要重新修改微信号',
  status: 'PENDING',
  timeline: [],
  user_id: 'USER-1',
  wechat_id: 'wx-private'
}

describe('contact capabilities', () => {
  it('reads correction list and detail through declared endpoints', async () => {
    const request = vi
      .fn<(options: ApiRequestOptions) => Promise<unknown>>()
      .mockResolvedValueOnce({ items: [correction], page: 1, page_size: 20, total: 1 })
      .mockResolvedValueOnce(correction)
    const capabilities = createContactCapabilities({ request } as ApiClient)
    const signal = new AbortController().signal

    const page = await capabilities.listCorrections('PENDING', signal)
    const detail = await capabilities.getCorrection('CORRECTION/1', signal)

    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/api/v1/admin/contact-corrections',
      query: { page: 1, page_size: 20, status: 'PENDING' },
      signal
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/api/v1/admin/contact-corrections/CORRECTION%2F1',
      signal
    })
    expect(page.items[0]?.wechat_id).toBe('wx-private')
    expect(detail.reason).toBe('需要重新修改微信号')
  })

  it('sends correction decisions with the caller idempotency key', async () => {
    const request = vi.fn<(options: ApiRequestOptions) => Promise<unknown>>().mockResolvedValue({
      id: 'CORRECTION-1',
      processed_at: '2026-09-29T09:00:00Z',
      status: 'APPROVED'
    })
    const capabilities = createContactCapabilities({ request } as ApiClient)

    await capabilities.decideCorrection('CORRECTION/1', 'approve', 'idem-1')

    expect(request).toHaveBeenCalledWith({
      idempotencyKey: 'idem-1',
      method: 'POST',
      path: '/api/v1/admin/contact-corrections/CORRECTION%2F1/commands/approve',
      signal: undefined
    })
  })

  it('provides status, verification and copy-audit commands without leaking values', async () => {
    const projection = {
      change_pending: false,
      contact_status: 'CONTACTED',
      updated_at: '2026-09-29T09:00:00Z',
      user_id: 'USER-1',
      verified_at: null,
      verified_by: null,
      wechat_id: 'wx-private'
    }
    const request = vi
      .fn<(options: ApiRequestOptions) => Promise<unknown>>()
      .mockResolvedValueOnce(projection)
      .mockResolvedValueOnce(projection)
      .mockResolvedValueOnce(undefined)
    const capabilities = createContactCapabilities({ request } as ApiClient)

    await capabilities.updateStatus('USER/1', 'CONTACTED')
    await capabilities.verifyChange('USER/1')
    await capabilities.auditCopy('USER/1')

    expect(request).toHaveBeenNthCalledWith(1, {
      body: { status: 'CONTACTED' },
      method: 'POST',
      path: '/api/v1/admin/users/USER%2F1/commands/contact-status',
      signal: undefined
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/api/v1/admin/users/USER%2F1/commands/verify-contact-change',
      signal: undefined
    })
    expect(request).toHaveBeenNthCalledWith(3, {
      method: 'POST',
      path: '/api/v1/admin/users/USER%2F1/contact-copy-events',
      signal: undefined
    })
    expect(JSON.stringify(vi.mocked(request).mock.calls[2]?.[0])).not.toContain('wx-private')
  })

  it('does not touch the clipboard when copy audit fails', async () => {
    const capabilities = createContactCapabilities({
      request: vi.fn().mockRejectedValue(new Error('audit unavailable'))
    })
    const clipboard = { writeText: vi.fn() }

    await expect(copyContactValue(capabilities, 'USER-1', 'wx-private', clipboard)).rejects.toThrow(
      'audit unavailable'
    )

    expect(clipboard.writeText).not.toHaveBeenCalled()
  })
})

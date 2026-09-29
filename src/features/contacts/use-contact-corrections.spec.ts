import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type {
  ContactCapabilities,
  ContactCorrectionDto,
  ContactCorrectionPageDto
} from './contact-capabilities'

import { useContactCorrections } from './use-contact-corrections'

const correction: ContactCorrectionDto = {
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

function createCapabilities(): ContactCapabilities {
  const page: ContactCorrectionPageDto = { items: [correction], page: 1, page_size: 20, total: 1 }
  return {
    auditCopy: vi.fn(),
    canCopySensitiveValue: true,
    decideCorrection: vi.fn().mockResolvedValue({
      id: correction.id,
      processed_at: '2026-09-29T09:00:00Z',
      status: 'APPROVED'
    }),
    getCorrection: vi.fn().mockResolvedValue(correction),
    listCorrections: vi.fn().mockResolvedValue(page),
    updateStatus: vi.fn(),
    verifyChange: vi.fn()
  }
}

describe('useContactCorrections', () => {
  it('reloads correction detail after a successful idempotent decision', async () => {
    const capabilities = createCapabilities()
    const approved = {
      ...correction,
      processed_at: '2026-09-29T09:00:00Z',
      status: 'APPROVED' as const
    }
    vi.mocked(capabilities.getCorrection)
      .mockResolvedValueOnce(correction)
      .mockResolvedValueOnce(approved)
    const controller = useContactCorrections(capabilities)

    await controller.loadDetail(correction.id)
    await controller.decide(correction.id, 'approve')

    expect(capabilities.decideCorrection).toHaveBeenCalledWith(
      correction.id,
      'approve',
      expect.stringMatching(/^idem-/),
      expect.any(AbortSignal)
    )
    expect(capabilities.getCorrection).toHaveBeenCalledTimes(2)
    expect(controller.detail.value?.status).toBe('APPROVED')
  })

  it('keeps current detail and asks for refresh on a 409 conflict', async () => {
    const capabilities = createCapabilities()
    vi.mocked(capabilities.decideCorrection).mockRejectedValue(
      new ApiError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: '数据状态已变化',
        requestId: 'request-1',
        status: 409
      })
    )
    const controller = useContactCorrections(capabilities)
    await controller.loadDetail(correction.id)

    await expect(controller.decide(correction.id, 'approve')).rejects.toBeInstanceOf(ApiError)

    expect(controller.detail.value).toEqual(correction)
    expect(controller.error.value).toContain('刷新')
    expect(capabilities.getCorrection).toHaveBeenCalledTimes(1)
  })
})

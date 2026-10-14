import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { LimitedEntitlementAdapter } from './limited-entitlement-adapter'

import { useLimitedEntitlementCommand } from './use-limited-entitlement-command'

const previewGrant = async () => ({
  before: null,
  after: {
    id: null,
    userId: 'USER-1',
    campaignVersionId: 'VERSION-B',
    status: 'PENDING',
    grantedAt: '2026-10-14T10:00:00Z',
    startDeadline: '2026-10-21T10:00:00Z',
    activatedAt: null,
    expiresAt: null,
    remedyCount: 0,
    version: 1
  },
  actualOperation: 'GRANT',
  expectedVersion: 1,
  expectedFingerprint: 'a'.repeat(64)
})

describe('limited entitlement command', () => {
  it('requires a server preview for grants and invalidates it when the source version changes', async () => {
    const controller = useLimitedEntitlementCommand({ execute: vi.fn(), preview: previewGrant })
    const draft = {
      campaignVersionId: 'VERSION-B',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1',
      expectedVersion: 1
    }
    controller.setDraft(draft)
    await expect(controller.submit('')).rejects.toThrow('请先获取服务端预览')
    await controller.preview()
    controller.setDraft({ ...draft, expectedVersion: 2 })
    expect(controller.previewResult.value).toBeNull()
  })
  it.each([
    new TypeError('connection lost'),
    new ApiError({ code: 'HTTP_503', message: '暂不可用', requestId: 'req-503', status: 503 })
  ])(
    'retains the exact retry key when detail refresh recreates the same draft after %s',
    async (failure) => {
      const execute = vi
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ id: 'LIMITED-1' })
      const controller = useLimitedEntitlementCommand({ execute, preview: previewGrant })
      const draft = {
        campaignVersionId: 'VERSION-B',
        entitlementId: null,
        operation: 'GRANT' as const,
        userId: 'USER-1'
      }
      controller.setDraft(draft)
      await controller.preview()
      await expect(controller.submit('')).rejects.toBe(failure)
      controller.setDraft({ ...draft })
      await controller.submit('')
      expect(execute.mock.calls[1]?.[0]).toEqual(execute.mock.calls[0]?.[0])
      expect(execute.mock.calls[1]?.[1]).toBe(execute.mock.calls[0]?.[1])
    }
  )

  it('maps capacity conflicts to a visible disabled reason while preserving input', async () => {
    const capacityError = new ApiError({
      code: 'CAMPAIGN_CAPACITY_REACHED',
      message: '活动容量已满',
      requestId: 'req-capacity',
      status: 409
    })
    const adapter: LimitedEntitlementAdapter = {
      preview: previewGrant,
      execute: vi.fn(async () => Promise.reject(capacityError))
    }
    const controller = useLimitedEntitlementCommand(adapter)
    const draft = {
      campaignVersionId: 'VERSION-1',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1'
    }
    controller.setDraft(draft)

    await controller.preview()

    await expect(controller.submit('运营开通')).rejects.toBe(capacityError)
    expect(controller.draft.value).toEqual(draft)
    expect(controller.disabledReason.value).toBe('活动容量已满，无法继续开通')
  })
})

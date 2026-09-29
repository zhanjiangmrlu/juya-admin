import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { LimitedEntitlementAdapter } from './limited-entitlement-adapter'

import { useLimitedEntitlementCommand } from './use-limited-entitlement-command'

describe('limited entitlement command', () => {
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
      const controller = useLimitedEntitlementCommand({ execute })
      const draft = {
        campaignVersionId: 'VERSION-B',
        entitlementId: null,
        operation: 'GRANT' as const,
        userId: 'USER-1'
      }
      controller.setDraft(draft)
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

    await expect(controller.submit('运营开通')).rejects.toBe(capacityError)
    expect(controller.draft.value).toEqual(draft)
    expect(controller.disabledReason.value).toBe('活动容量已满，无法继续开通')
  })
})

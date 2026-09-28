import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { LimitedEntitlementAdapter } from './limited-entitlement-adapter'

import { useLimitedEntitlementCommand } from './use-limited-entitlement-command'

describe('limited entitlement command', () => {
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

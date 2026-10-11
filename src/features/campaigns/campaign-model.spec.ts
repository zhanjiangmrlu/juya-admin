import { describe, expect, it } from 'vitest'

import { getCampaignFieldAccess, validateCapacityLimit } from './campaign-model'

describe('campaign model', () => {
  it('allows explicitly unlimited capacity without using a large placeholder', () => {
    expect(validateCapacityLimit(42, null)).toEqual({ valid: true })
  })
  it('locks duration, scene order and activation window after first grant', () => {
    const access = getCampaignFieldAccess({ hasGrantedEntitlements: true })

    expect(access.duration).toBe('readonly')
    expect(access.sceneOrder).toBe('readonly')
    expect(access.activationWindow).toBe('readonly')
    expect(access.capacity).toBe('editable')
  })

  it('rejects capacity below current grants and accepts a legal increase', () => {
    expect(validateCapacityLimit(42, 41)).toEqual({
      message: '容量不能小于已开通人数 42',
      valid: false
    })
    expect(validateCapacityLimit(42, 60)).toEqual({ valid: true })
  })
})

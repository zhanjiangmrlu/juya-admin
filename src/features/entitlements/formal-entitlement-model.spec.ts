import { describe, expect, it } from 'vitest'

import { FORMAL_TERMS, getFormalOperations } from './formal-entitlement-model'

describe('formal entitlement model', () => {
  it('exposes only the six fixed terms and never renews a permanent entitlement', () => {
    expect(FORMAL_TERMS).toEqual([
      'month_1',
      'month_2',
      'month_3',
      'month_6',
      'month_12',
      'permanent'
    ])
    expect(getFormalOperations('ACTIVE', 'permanent')).not.toContain('RENEW')
  })

  it('returns only operations allowed by the current status', () => {
    expect(getFormalOperations('ACTIVE', 'month_3')).toEqual(['RENEW', 'PAUSE', 'REVOKE'])
    expect(getFormalOperations('PAUSED', 'month_3')).toEqual(['RENEW', 'RESUME', 'REVOKE'])
    expect(getFormalOperations('REVOKED', 'month_3')).toEqual(['GRANT'])
  })
})

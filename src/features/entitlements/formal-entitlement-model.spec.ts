import { describe, expect, it } from 'vitest'

import { FORMAL_TERMS, getFormalOperations } from './formal-entitlement-model'

describe('formal entitlement model', () => {
  it('exposes only the six fixed terms and never renews a permanent entitlement', () => {
    expect(FORMAL_TERMS).toEqual([
      'MONTH_1',
      'MONTH_2',
      'MONTH_3',
      'MONTH_6',
      'MONTH_12',
      'PERMANENT'
    ])
    expect(getFormalOperations('ACTIVE', 'PERMANENT')).not.toContain('RENEW')
  })

  it('returns only operations allowed by the current status', () => {
    expect(getFormalOperations('ACTIVE', 'MONTH_3')).toEqual(['RENEW', 'PAUSE', 'REVOKE'])
    expect(getFormalOperations('PAUSED', 'MONTH_3')).toEqual(['RENEW', 'RESUME', 'REVOKE'])
    expect(getFormalOperations('REVOKED', 'MONTH_3')).toEqual(['GRANT'])
  })
})

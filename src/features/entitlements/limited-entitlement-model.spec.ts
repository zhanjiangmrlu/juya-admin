import { describe, expect, it } from 'vitest'

import { getLimitedOperations } from './limited-entitlement-model'

describe('limited entitlement model', () => {
  it('never remedies active access and allows a pending deadline extension only once', () => {
    expect(getLimitedOperations({ remedyCount: 0, status: 'ACTIVE' })).not.toContain(
      'EXTEND_START_DEADLINE'
    )
    expect(getLimitedOperations({ remedyCount: 0, status: 'PENDING' })).toContain(
      'EXTEND_START_DEADLINE'
    )
    expect(getLimitedOperations({ remedyCount: 1, status: 'PENDING' })).not.toContain(
      'EXTEND_START_DEADLINE'
    )
  })

  it('offers restore only for an unused expired start window', () => {
    expect(getLimitedOperations({ remedyCount: 0, status: 'START_EXPIRED' })).toEqual([
      'RESTORE_START_WINDOW',
      'REVOKE'
    ])
    expect(getLimitedOperations({ remedyCount: 1, status: 'START_EXPIRED' })).toEqual(['REVOKE'])
  })
})

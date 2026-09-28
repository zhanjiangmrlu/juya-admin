import { describe, expect, it } from 'vitest'

import { getCapability } from './capability-registry'

describe('capability registry', () => {
  it('marks implemented user queries as available', () => {
    expect(getCapability('users.list')).toBe('available')
    expect(getCapability('users.detail')).toBe('available')
    expect(getCapability('users.wechat-search')).toBe('available')
  })

  it('marks unsupported contact commands as pending', () => {
    expect(getCapability('contacts.correction-command')).toBe('pending')
    expect(getCapability('contacts.copy-audit')).toBe('pending')
  })
})

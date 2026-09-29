import { describe, expect, it } from 'vitest'

import { getCapability } from './capability-registry'

describe('capability registry', () => {
  it('marks implemented user queries as available', () => {
    expect(getCapability('users.list')).toBe('available')
    expect(getCapability('users.detail')).toBe('available')
    expect(getCapability('users.wechat-search')).toBe('available')
  })

  it('marks implemented contact capabilities as available', () => {
    expect(getCapability('contacts.correction-command')).toBe('available')
    expect(getCapability('contacts.correction-list')).toBe('available')
    expect(getCapability('contacts.copy-audit')).toBe('available')
  })

  it('marks the complete feedback loop as available', () => {
    expect(getCapability('feedback.list')).toBe('available')
    expect(getCapability('feedback.detail')).toBe('available')
    expect(getCapability('feedback.command')).toBe('available')
    expect(getCapability('feedback.screenshot-url')).toBe('available')
  })
})

import { describe, expect, it } from 'vitest'

import { validateSystemConfig } from './system-config-model'

describe('system config model', () => {
  it('validates SLA, expiry threshold and review switches', () => {
    expect(validateSystemConfig({ ...draft, feedbackSlaHours: 0 }).valid).toBe(false)
    expect(validateSystemConfig({ ...draft, expiryWarningDays: 91 }).valid).toBe(false)
    expect(validateSystemConfig(draft).valid).toBe(true)
  })
})

const draft = {
  expiryWarningDays: 7,
  feedbackSlaHours: 24,
  readonlyPreviewEnabled: true,
  shadowingEnabled: true,
  unentitledMaterialEntryEnabled: true
}

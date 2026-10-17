import { expect, it, vi } from 'vitest'

import { ensureRandomUUID } from './browser-compatibility'

it('provides unique RFC4122 version-four IDs when plain HTTP lacks randomUUID', () => {
  const provider = {
    getRandomValues: crypto.getRandomValues.bind(crypto)
  } as Crypto
  ensureRandomUUID(provider)
  const values = Array.from({ length: 100 }, () => provider.randomUUID())
  expect(new Set(values).size).toBe(100)
  for (const value of values)
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

it('keeps the browser native generator on secure origins', () => {
  const native = vi.fn(() => crypto.randomUUID())
  const provider = { randomUUID: native } as unknown as Crypto
  ensureRandomUUID(provider)
  expect(provider.randomUUID).toBe(native)
})

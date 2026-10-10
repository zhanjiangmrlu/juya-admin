import { afterEach, describe, expect, it, vi } from 'vitest'

import { createIdempotencyKey, createRequestId } from '@/services/api/api-client'

import { createUuid } from './create-uuid'

afterEach(() => vi.unstubAllGlobals())

describe('UUID in HTTP test deployments', () => {
  it('preserves native UUID generation', () => {
    const native = vi.fn(() => 'native-uuid')
    vi.stubGlobal('crypto', { randomUUID: native })
    expect(createUuid()).toBe('native-uuid')
  })

  it('generates UUID v4 and API identifiers when randomUUID is unavailable', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
    expect(createUuid()).toMatch(uuidPattern)
    expect(createRequestId()).toMatch(/^web-[\da-f-]{36}$/)
    expect(createIdempotencyKey()).toMatch(/^idem-[\da-f-]{36}$/)
    expect(createUuid()).not.toBe(createUuid())
  })
})

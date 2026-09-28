import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { createContactCapabilities } from './contact-capabilities'

describe('contact capabilities', () => {
  it('returns pending without sending an unknown correction command', async () => {
    const client: ApiClient = { request: vi.fn() }
    const capabilities = createContactCapabilities(client)

    await expect(capabilities.submitCorrection('CORRECTION-1', 'approve')).resolves.toEqual({
      state: 'pending'
    })
    expect(client.request).not.toHaveBeenCalled()
  })

  it('keeps sensitive copy disabled while audit API is pending', () => {
    const capabilities = createContactCapabilities({ request: vi.fn() })

    expect(capabilities.canCopySensitiveValue).toBe(false)
  })
})

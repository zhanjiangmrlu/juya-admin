import { describe, expect, it } from 'vitest'

import type { ApiClient, ApiRequestOptions } from '@/services/api/api-client'

import { createAuthAdapter } from './auth-adapter'

describe('auth adapter', () => {
  it('restores session credentials from the dedicated session endpoint', async () => {
    let request: ApiRequestOptions | undefined
    const client: ApiClient = {
      request: async <T>(options: ApiRequestOptions): Promise<T> => {
        request = options
        return {
          csrf_token: 'csrf-restored',
          expires_at: '2026-09-29T20:00:00Z'
        } as T
      }
    }

    const session = await createAuthAdapter(client).probeSession()

    expect(request).toEqual({ method: 'GET', path: '/api/v1/admin/session' })
    expect(session).toEqual({
      csrfToken: 'csrf-restored',
      expiresAt: '2026-09-29T20:00:00Z'
    })
  })
})

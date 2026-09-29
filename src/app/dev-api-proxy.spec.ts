import { describe, expect, it } from 'vitest'

import { createDevApiProxy } from './dev-api-proxy'

describe('development API proxy', () => {
  it('uses the local admin API as the default target', () => {
    expect(createDevApiProxy()).toEqual({
      '/api': {
        changeOrigin: true,
        target: 'http://127.0.0.1:8000'
      }
    })
  })

  it('falls back for blank targets and removes trailing slashes', () => {
    expect(createDevApiProxy('   ')['/api']).toMatchObject({
      target: 'http://127.0.0.1:8000'
    })
    expect(createDevApiProxy('http://localhost:9000///')['/api']).toMatchObject({
      target: 'http://localhost:9000'
    })
  })
})

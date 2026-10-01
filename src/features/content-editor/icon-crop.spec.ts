import { describe, expect, it } from 'vitest'

import { suggestCrop, validateCrop } from './icon-crop'

describe('manual icon crop confirmation', () => {
  it('suggests a centered square and rejects out-of-image or empty crops', () => {
    expect(suggestCrop(100, 200)).toEqual({ x: 0, y: 50, width: 100, height: 100 })
    expect(validateCrop({ x: 10, y: 20, width: 30, height: 40 }, 100, 200)).toBe(true)
    expect(validateCrop({ x: -1, y: 20, width: 30, height: 40 }, 100, 200)).toBe(false)
    expect(validateCrop({ x: 80, y: 20, width: 30, height: 40 }, 100, 200)).toBe(false)
    expect(validateCrop({ x: 0, y: 0, width: 0, height: 10 }, 100, 200)).toBe(false)
  })
})

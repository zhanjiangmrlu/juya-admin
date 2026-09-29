import { describe, expect, it } from 'vitest'

import { validateImageBatch } from './import-validation'

describe('image import validation', () => {
  it('rejects oversized and mixed image batches', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, index) => image(`image-${index}.png`))
    expect(validateImageBatch(thirtyOne).valid).toBe(false)
    expect(validateImageBatch([image('a.png', 's1'), image('b.png', 's2')]).code).toBe(
      'MIXED_SERIES'
    )
    expect(validateImageBatch([image('a.png', 's1', 't1'), image('b.png', 's1', 't2')]).code).toBe(
      'MIXED_TEMPLATE'
    )
  })
})

function image(name: string, seriesId = 's1', templateId = 't1') {
  return { file: new File(['x'], name, { type: 'image/png' }), seriesId, templateId }
}

import { expect, it } from 'vitest'

import { thumbnailDimensions } from '@/services/thumbnail-dimensions'

it.each([
  [1200, 1800, 144, 216],
  [2000, 1000, 144, 72],
  [1000, 4000, 54, 216],
  [120, 80, 120, 80]
])(
  'fits %i by %i without cropping or upscaling',
  (width, height, expectedWidth, expectedHeight) => {
    expect(thumbnailDimensions(width, height)).toEqual({
      width: expectedWidth,
      height: expectedHeight
    })
  }
)
it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid dimensions %s', (value) => {
  expect(() => thumbnailDimensions(value, 100)).toThrow('原图尺寸无效')
})

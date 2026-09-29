import { describe, expect, it } from 'vitest'

import { pageManifest } from './page-manifest'

const expectedPageIds = Array.from(
  { length: 26 },
  (_, index) => `A${String(index + 1).padStart(2, '0')}`
)

describe('admin visual page manifest', () => {
  it('covers A01 through A26 with both acceptance viewports', () => {
    expect(pageManifest.map((page) => page.id)).toEqual(expectedPageIds)
    expect(pageManifest.every((page) => page.viewports.length === 2)).toBe(true)
    expect(
      pageManifest.every((page) => page.viewports.some((viewport) => viewport.width === 1440))
    ).toBe(true)
    expect(
      pageManifest.every((page) => page.viewports.some((viewport) => viewport.width === 1280))
    ).toBe(true)
  })

  it('uses unique page ids and concrete representative paths', () => {
    expect(new Set(pageManifest.map((page) => page.id))).toHaveLength(26)
    expect(pageManifest.every((page) => !page.path.includes(':'))).toBe(true)
  })
})

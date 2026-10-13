import { describe, expect, it } from 'vitest'

import { publishCheckLabel } from './publish-check-labels'

describe('V1.5 publish check guidance', () => {
  it.each([
    ['PROOFREADING_CONFIRMATION_REQUIRED', '抽样'],
    ['SENTENCE_SLICE_INVALID', '音频'],
    ['CHUNK_IMAGE_INVALID', '语块']
  ])('explains %s in Chinese with a correction location', (code, location) => {
    expect(publishCheckLabel(code)).toContain(location)
    expect(publishCheckLabel(code)).not.toContain(code)
  })
})

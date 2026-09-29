import { describe, expect, it } from 'vitest'

import { validateAudioBatch } from './audio-version-model'

describe('audio version model', () => {
  it('rejects batches above 300 files', () => {
    const files = Array.from({ length: 301 }, (_, index) => new File(['x'], `${index}.mp3`))
    expect(validateAudioBatch(files).valid).toBe(false)
  })
})

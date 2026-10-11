import { describe, expect, it } from 'vitest'

import {
  validateLearningModules,
  validateOpenScenes,
  validatePreviewScenes
} from './discovery-model'

describe('discovery configuration', () => {
  it('allows all four modules and the all-disabled state, rejects unknown types', () => {
    expect(validateLearningModules([{ enabled: true, type: 'grammar' }]).valid).toBe(true)
    expect(validateLearningModules([{ enabled: true, type: 'short_reading' }]).valid).toBe(true)
    expect(validateLearningModules([{ enabled: true, type: 'unknown' }]).valid).toBe(false)
    expect(validateLearningModules([{ enabled: false, type: 'grammar' }]).valid).toBe(true)
    expect(validateOpenScenes(['scene-1', 'scene-2']).valid).toBe(false)
  })

  it('requires three to six previews and excludes open scenes', () => {
    expect(
      validatePreviewScenes(['scene-1', 'scene-4', 'scene-5'], ['scene-1', 'scene-2', 'scene-3'])
        .code
    ).toBe('PREVIEW_SCENE_IS_OPEN')
  })
})

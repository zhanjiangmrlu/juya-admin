import { describe, expect, it } from 'vitest'

import { getSceneOperations } from './content-model'

describe('content model', () => {
  it('allows published content to create a draft or go offline without permanent deletion', () => {
    expect(getSceneOperations({ id: 'scene-1', status: 'PUBLISHED' })).toEqual([
      'CREATE_REVISION',
      'OFFLINE'
    ])
  })
})

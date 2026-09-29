import { describe, expect, it } from 'vitest'

import { getDraftOperations, validateBatchJobSize } from './batch-job-model'

describe('batch job model', () => {
  it('rejects jobs above 500 items and protects referenced drafts', () => {
    expect(validateBatchJobSize(501).valid).toBe(false)
    expect(getDraftOperations({ referenced: true })).not.toContain('CLEANUP')
  })
})

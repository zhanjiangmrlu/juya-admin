import { describe, expect, it } from 'vitest'

import { mapCloudUsage } from './cloud-usage-model'

describe('cloud usage', () => {
  it('keeps unknown actual units empty and labels the reserved units separately', () => {
    const result = mapCloudUsage({
      measured_cloud: [
        {
          kind: 'AI_TOKENS',
          attempts: 2,
          reserved_units: 400,
          actual_units: null,
          unknown_attempts: 1
        }
      ],
      tts: {
        attempts: 1,
        reserved_characters: 8,
        actual_characters: 5,
        verified_actual_microcost: null
      },
      import_batches: [{ status: 'PREVIEW_READY', count: 3 }],
      wechat_id: 'private'
    })
    expect(result.rows[0]).toMatchObject({
      name: 'AI token',
      actual: '—',
      reserved: '400 token',
      unknown: 1
    })
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result.importBatches).toBe(3)
  })
  it('converts measured ASR milliseconds to decoded audio seconds without changing billing facts', () => {
    expect(
      mapCloudUsage({
        measured_cloud: [
          { kind: 'ASR_MILLISECONDS', actual_units: 123400, reserved_units: 200000, attempts: 2 }
        ]
      }).rows[0]?.actual
    ).toBe('123.4 秒')
  })
})

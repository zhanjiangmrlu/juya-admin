import { describe, expect, it, vi } from 'vitest'

import { useContentStage } from './use-content-stage'

const stage = {
  public_id: 'STAGE',
  item_id: 'BATCH',
  stage: 'VALIDATE',
  status: 'FAILED',
  input_hash: 'a'.repeat(64),
  config_version: 'parser-v1',
  fencing_version: 2,
  attempt: 1,
  error_code: 'LOCAL_FAILURE'
}
describe('explicit failed stage recovery', () => {
  it('includes the current edit version for local automatic audio recovery without paid retry acknowledgement', async () => {
    let received: unknown = null
    const controller = useContentStage({
      load: async () => ({ ...stage, stage: 'AUTO_AUDIO' }),
      retry: async (_id, body) => {
        received = body
        return { stage_id: 'STAGE', status: 'QUEUED' }
      }
    })
    await controller.load('STAGE')
    controller.confirmed.value = true
    expect(controller.canRetry.value).toBe(false)
    controller.editVersion.value = 7
    expect(controller.charged.value).toBe(false)
    expect(controller.canRetry.value).toBe(true)
    await controller.retry()
    expect(received).toMatchObject({
      expected_edit_version: 7,
      manual_confirmed: true,
      acknowledged_charged_retry: false
    })
  })
  it('requires an actual FAILED state and preserves retry identity after lost response', async () => {
    const retry = vi.fn().mockRejectedValue(new Error('response lost'))
    const controller = useContentStage({ load: vi.fn(async () => stage), retry })
    await controller.load('STAGE')
    expect(controller.canRetry.value).toBe(false)
    controller.confirmed.value = true
    await controller.retry()
    await controller.retry()
    expect(retry).toHaveBeenCalledWith(
      'STAGE',
      expect.objectContaining({
        expected_fence: 2,
        input_hash: stage.input_hash,
        config_version: 'parser-v1',
        manual_confirmed: true,
        acknowledged_charged_retry: false
      }),
      expect.any(String)
    )
    expect(retry.mock.calls[0]?.[2]).toBe(retry.mock.calls[1]?.[2])
  })
  it('requires current edit version and explicit paid-stage acknowledgement without allowing UNKNOWN', async () => {
    const load = vi.fn(async () => ({ ...stage, stage: 'AI_LEXICON' }))
    const controller = useContentStage({ load, retry: vi.fn() })
    await controller.load('STAGE')
    controller.confirmed.value = true
    controller.editVersion.value = 3
    expect(controller.canRetry.value).toBe(false)
    controller.chargedAcknowledged.value = true
    expect(controller.canRetry.value).toBe(true)
    load.mockResolvedValueOnce({ ...stage, stage: 'AI_LEXICON', status: 'UNKNOWN' })
    await controller.load('STAGE')
    controller.confirmed.value = true
    controller.chargedAcknowledged.value = true
    expect(controller.canRetry.value).toBe(false)
  })
})

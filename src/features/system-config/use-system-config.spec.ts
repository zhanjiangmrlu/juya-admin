import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useSystemConfig } from './use-system-config'

describe('system config controller', () => {
  it('uses expected versions and preserves a local draft after conflict reload', async () => {
    const conflict = new ApiError({
      code: 'CONFIG_VERSION_CONFLICT',
      message: '配置冲突',
      requestId: 'r1',
      status: 409
    })
    const update = vi.fn().mockRejectedValue(conflict)
    const load = vi.fn().mockResolvedValue(remoteSnapshot)
    const controller = useSystemConfig({ load, update })
    controller.applySnapshot(localSnapshot)

    await expect(controller.save(localDraft)).rejects.toBe(conflict)
    expect(update.mock.calls[0]?.[2]).toBe(3)
    expect(controller.conflict.value?.remoteVersion).toBe(4)
    expect(controller.draft.value).toEqual(localDraft)
  })
})

const localDraft = {
  expiryWarningDays: 7,
  feedbackSlaHours: 48,
  readonlyPreviewEnabled: true,
  shadowingEnabled: true,
  unentitledMaterialEntryEnabled: false
}
const localSnapshot = { draft: localDraft, versions: { feedback_sla_hours: 3 } }
const remoteSnapshot = {
  draft: { ...localDraft, feedbackSlaHours: 72 },
  versions: { feedback_sla_hours: 4 }
}

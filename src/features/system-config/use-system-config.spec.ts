import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useSystemConfig } from './use-system-config'

describe('system config controller', () => {
  it('rejects saving before a complete version snapshot is loaded', async () => {
    const update = vi.fn()
    const controller = useSystemConfig({ load: vi.fn(), update })
    await expect(controller.save(localDraft)).rejects.toThrow('配置尚未加载')
    expect(update).not.toHaveBeenCalled()
  })
  it('rejects saves during loading and reports a failed initial load', async () => {
    let rejectLoad!: (failure: Error) => void
    const update = vi.fn()
    const controller = useSystemConfig({
      load: () =>
        new Promise((_, reject) => {
          rejectLoad = reject
        }),
      update
    })
    const pending = controller.load()
    expect(controller.isLoading.value).toBe(true)
    await expect(controller.save(localDraft)).rejects.toThrow('配置尚未加载')
    rejectLoad(new Error('读取失败'))
    await expect(pending).rejects.toThrow('读取失败')
    expect(controller.error.value).toBe('读取失败')
    expect(controller.isReady.value).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
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
    expect(controller.conflict.value?.remoteDraft.feedbackSlaHours).toBe(72)
    controller.dismissConflict()
    expect(controller.conflict.value).toBeNull()
    expect(controller.draft.value).toEqual(localDraft)
    update.mockResolvedValue({ key: 'feedback_sla_hours', value: { value: 48 }, version: 5 })
    await controller.save(localDraft)
    expect(update.mock.calls[1]?.[2]).toBe(4)
  })
})

const localDraft = {
  expiryWarningDays: 7,
  feedbackSlaHours: 48,
  readonlyPreviewEnabled: true,
  shadowingEnabled: true,
  unentitledMaterialEntryEnabled: false
}
const versions = {
  entitlement_expiry_warning_days: 3,
  feedback_sla_hours: 3,
  readonly_preview_enabled: 3,
  shadowing_enabled: 3,
  unentitled_material_entry_enabled: 3
}
const localSnapshot = { draft: localDraft, versions }
const remoteSnapshot = {
  draft: { ...localDraft, feedbackSlaHours: 72 },
  versions: Object.fromEntries(Object.keys(versions).map((key) => [key, 4]))
}

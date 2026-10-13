import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type {
  FormalEntitlementAdapter,
  FormalEntitlementPreview
} from './formal-entitlement-adapter'

import { useFormalEntitlementCommand } from './use-formal-entitlement-command'

const previewResult: FormalEntitlementPreview = {
  expiresAt: '2026-12-29T08:00:00Z',
  grantedAt: '2026-09-29T08:00:00Z',
  id: 'ENT-1',
  packageId: 'PACKAGE-1',
  status: 'ACTIVE',
  term: 'month_3',
  userId: 'USER-1',
  version: 1,
  before: null,
  actualOperation: 'GRANT',
  expectedVersion: 0,
  previewedAt: '2026-09-29T08:00:00Z'
}

describe('formal entitlement command', () => {
  it('requires an explicit extension reason before previewing', async () => {
    const controller = useFormalEntitlementCommand({
      execute: vi.fn(async () => previewResult),
      preview: vi.fn(async () => previewResult)
    })
    controller.setDraft({
      operation: 'EXTEND',
      packageId: 'PACKAGE-1',
      term: 'month_1',
      userId: 'USER-1',
      reason: '  '
    })
    await expect(controller.preview()).rejects.toThrow('延期原因')
    expect(controller.canConfirm.value).toBe(false)
  })
  it('rejects a permanent extension and a blank confirmation reason', async () => {
    const controller = useFormalEntitlementCommand({
      execute: vi.fn(async () => previewResult),
      preview: vi.fn(async () => ({ ...previewResult, actualOperation: 'EXTEND' }))
    })
    controller.setDraft({
      operation: 'EXTEND',
      packageId: 'PACKAGE-1',
      term: 'permanent',
      userId: 'USER-1',
      reason: '服务补偿'
    })
    await expect(controller.preview()).rejects.toThrow('有限自然月')
    controller.setDraft({
      operation: 'EXTEND',
      packageId: 'PACKAGE-1',
      term: 'month_1',
      userId: 'USER-1',
      reason: '服务补偿'
    })
    await controller.preview()
    await expect(controller.submit('  ')).rejects.toThrow('延期原因')
  })
  it('allows confirmation only after a successful server preview', async () => {
    const adapter: FormalEntitlementAdapter = {
      execute: vi.fn(async () => previewResult),
      preview: vi.fn(async () => previewResult)
    }
    const controller = useFormalEntitlementCommand(adapter)
    controller.setDraft({
      operation: 'GRANT',
      packageId: 'PACKAGE-1',
      term: 'month_3',
      userId: 'USER-1'
    })

    expect(controller.canConfirm.value).toBe(false)
    await controller.preview()
    expect(controller.canConfirm.value).toBe(true)
    expect(controller.previewResult.value?.expiresAt).toBe('2026-12-29T08:00:00Z')
  })

  it('preserves draft input and exposes a refresh action after a 409 conflict', async () => {
    const conflict = new ApiError({
      code: 'ENTITLEMENT_STATE_CONFLICT',
      message: '状态已变化',
      requestId: 'req-1',
      status: 409
    })
    const adapter: FormalEntitlementAdapter = {
      execute: vi.fn(async () => Promise.reject(conflict)),
      preview: vi.fn(async () => previewResult)
    }
    const controller = useFormalEntitlementCommand(adapter)
    const draft = {
      operation: 'PAUSE' as const,
      packageId: 'PACKAGE-1',
      term: null,
      userId: 'USER-1'
    }
    controller.setDraft(draft)
    await controller.preview()

    await expect(controller.submit('运营确认暂停')).rejects.toBe(conflict)
    expect(controller.draft.value).toEqual(draft)
    expect(controller.hasConflict.value).toBe(true)
    expect(controller.canConfirm.value).toBe(false)
    expect(controller.previewResult.value).toBeNull()

    await controller.refreshPreview()
    expect(controller.hasConflict.value).toBe(false)
    expect(adapter.preview).toHaveBeenCalledTimes(2)
  })
  it('rejects a late preview after the administrator changes the target', async () => {
    let finish!: (value: FormalEntitlementPreview) => void
    const adapter: FormalEntitlementAdapter = {
      execute: vi.fn(async () => previewResult),
      preview: vi.fn(
        () =>
          new Promise<FormalEntitlementPreview>((resolve) => {
            finish = resolve
          })
      )
    }
    const controller = useFormalEntitlementCommand(adapter)
    controller.setDraft({
      operation: 'GRANT',
      packageId: 'PACKAGE-1',
      term: 'month_3',
      userId: 'USER-1'
    })
    const pending = controller.preview()
    controller.setDraft({
      operation: 'GRANT',
      packageId: 'PACKAGE-2',
      term: 'month_3',
      userId: 'USER-1'
    })
    finish(previewResult)
    await expect(pending).rejects.toThrow('预览已失效')
    expect(controller.canConfirm.value).toBe(false)
  })
})

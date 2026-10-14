import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { LimitedEntitlementAdapter } from './limited-entitlement-adapter'

import { useLimitedEntitlementCommand } from './use-limited-entitlement-command'

const previewGrant = async () => ({
  before: null,
  after: {
    id: null,
    userId: 'USER-1',
    campaignVersionId: 'VERSION-B',
    status: 'PENDING',
    grantedAt: '2026-10-14T10:00:00Z',
    startDeadline: '2026-10-21T10:00:00Z',
    activatedAt: null,
    expiresAt: null,
    remedyCount: 0,
    version: 1
  },
  actualOperation: 'GRANT',
  expectedVersion: 1,
  expectedFingerprint: 'a'.repeat(64)
})

describe('limited entitlement command', () => {
  it.each(['user', 'campaign'] as const)(
    'requires a fresh preview and a new request identity after changing the %s',
    async (field) => {
      const execute = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('response lost'))
        .mockResolvedValue({ id: 'LIMITED-NEW' })
      const preview = vi.fn(previewGrant)
      const controller = useLimitedEntitlementCommand({ execute, preview })
      const draft = {
        campaignVersionId: 'VERSION-B',
        entitlementId: null,
        operation: 'GRANT' as const,
        userId: 'USER-1'
      }
      controller.setDraft(draft)
      await controller.preview()
      await expect(controller.submit('')).rejects.toThrow('response lost')
      controller.setDraft({
        ...draft,
        ...(field === 'user' ? { userId: 'USER-2' } : { campaignVersionId: 'VERSION-C' })
      })
      expect(controller.canRetry.value).toBe(false)
      await expect(controller.retry()).rejects.toThrow('没有可重试')
      await expect(controller.submit('')).rejects.toThrow('请先获取')
      await controller.preview()
      await controller.submit('')
      expect(preview).toHaveBeenCalledTimes(2)
      expect(execute.mock.calls[1]?.[1]).not.toBe(execute.mock.calls[0]?.[1])
    }
  )

  it('binds a changed note to a fresh preview and a new key after uncertain failure', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValue({ id: 'LIMITED-NEW' })
    const preview = vi.fn(previewGrant)
    const controller = useLimitedEntitlementCommand({ execute, preview })
    controller.setDraft({
      campaignVersionId: 'VERSION-B',
      entitlementId: null,
      operation: 'GRANT',
      userId: 'USER-1'
    })
    await controller.preview()
    await expect(controller.submit('原备注')).rejects.toThrow('response lost')
    await expect(controller.submit('新备注')).rejects.toThrow('备注已变化')
    expect(execute).toHaveBeenCalledTimes(1)
    await controller.preview()
    await controller.submit('新备注')
    expect(preview).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1]?.[0].reason).toBe('新备注')
    expect(execute.mock.calls[1]?.[1]).not.toBe(execute.mock.calls[0]?.[1])
  })
  it('retries original prepared input after a rejected re-preview but requires fresh preview for a changed note', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValue({ id: 'LIMITED-1' })
    const preview = vi
      .fn()
      .mockResolvedValueOnce(await previewGrant())
      .mockRejectedValueOnce(
        new ApiError({
          code: 'LIMITED_ENTITLEMENT_EXISTS',
          message: '已开通',
          requestId: 'exists',
          status: 409
        })
      )
      .mockResolvedValue(await previewGrant())
    const controller = useLimitedEntitlementCommand({ execute, preview })
    const draft = {
      campaignVersionId: 'VERSION-B',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1'
    }
    controller.setDraft(draft)
    await controller.preview()
    await expect(controller.submit('原备注')).rejects.toThrow('response lost')
    expect(controller.canRetry.value).toBe(true)
    await expect(controller.submit('新备注')).rejects.toThrow('备注已变化')
    await expect(controller.preview()).rejects.toThrow('已开通')
    await controller.retry()
    expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0])
    expect(execute.mock.calls[1]?.[0].reason).toBe('原备注')
    expect(controller.canRetry.value).toBe(false)
    controller.setDraft({ ...draft, userId: 'USER-2' })
    await expect(controller.retry()).rejects.toThrow('没有可重试')
    await expect(controller.submit('新备注')).rejects.toThrow('请先获取')
    await controller.preview()
    await controller.submit('新备注')
    expect(execute.mock.calls[2]?.[1]).not.toBe(execute.mock.calls[0]?.[1])
  })

  it('never retries a known conflict and ignores a late result for a changed user', async () => {
    let resolve!: (value: { id: string }) => void
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError({
          code: 'CAMPAIGN_PREVIEW_CONFLICT',
          message: '状态已变化',
          requestId: 'conflict',
          status: 409
        })
      )
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    const controller = useLimitedEntitlementCommand({ execute, preview: previewGrant })
    const draft = {
      campaignVersionId: 'VERSION-B',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1'
    }
    controller.setDraft(draft)
    await controller.preview()
    await expect(controller.submit('')).rejects.toThrow('状态已变化')
    expect(controller.canRetry.value).toBe(false)
    await expect(controller.retry()).rejects.toThrow('没有可重试')
    await expect(controller.submit('')).rejects.toThrow('请先获取')
    await controller.preview()
    const pending = controller.submit('')
    controller.setDraft({ ...draft, userId: 'USER-2' })
    resolve({ id: 'OLD-USER-RESULT' })
    await expect(pending).rejects.toThrow('操作对象已变化')
    expect(controller.result.value).toBeNull()
    expect(controller.canRetry.value).toBe(false)
  })
  it('requires a server preview for grants and invalidates it when the source version changes', async () => {
    const controller = useLimitedEntitlementCommand({ execute: vi.fn(), preview: previewGrant })
    const draft = {
      campaignVersionId: 'VERSION-B',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1',
      expectedVersion: 1
    }
    controller.setDraft(draft)
    await expect(controller.submit('')).rejects.toThrow('请先获取服务端预览')
    await controller.preview()
    controller.setDraft({ ...draft, expectedVersion: 2 })
    expect(controller.previewResult.value).toBeNull()
  })
  it.each([
    new TypeError('connection lost'),
    new ApiError({ code: 'HTTP_503', message: '暂不可用', requestId: 'req-503', status: 503 })
  ])(
    'retains the exact retry key when detail refresh recreates the same draft after %s',
    async (failure) => {
      const execute = vi
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ id: 'LIMITED-1' })
      const controller = useLimitedEntitlementCommand({ execute, preview: previewGrant })
      const draft = {
        campaignVersionId: 'VERSION-B',
        entitlementId: null,
        operation: 'GRANT' as const,
        userId: 'USER-1'
      }
      controller.setDraft(draft)
      await controller.preview()
      await expect(controller.submit('')).rejects.toBe(failure)
      controller.setDraft({ ...draft })
      await controller.submit('')
      expect(execute.mock.calls[1]?.[0]).toEqual(execute.mock.calls[0]?.[0])
      expect(execute.mock.calls[1]?.[1]).toBe(execute.mock.calls[0]?.[1])
    }
  )

  it('maps capacity conflicts to a visible disabled reason while preserving input', async () => {
    const capacityError = new ApiError({
      code: 'CAMPAIGN_CAPACITY_REACHED',
      message: '活动容量已满',
      requestId: 'req-capacity',
      status: 409
    })
    const adapter: LimitedEntitlementAdapter = {
      preview: previewGrant,
      execute: vi.fn(async () => Promise.reject(capacityError))
    }
    const controller = useLimitedEntitlementCommand(adapter)
    const draft = {
      campaignVersionId: 'VERSION-1',
      entitlementId: null,
      operation: 'GRANT' as const,
      userId: 'USER-1'
    }
    controller.setDraft(draft)

    await controller.preview()

    await expect(controller.submit('运营开通')).rejects.toBe(capacityError)
    expect(controller.draft.value).toEqual(draft)
    expect(controller.disabledReason.value).toBe('活动容量已满，无法继续开通')
  })
})

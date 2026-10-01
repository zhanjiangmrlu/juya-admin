import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { usePublishCheck } from './use-publish-check'

describe('publish check controller', () => {
  it('blocks errors and unacknowledged warnings', () => {
    const controller = usePublishCheck(adapter(), 'revision-1')
    controller.applyCheck({
      expectedVersion: 3,
      errorCodes: ['TITLE_REQUIRED'],
      ready: false,
      warningCodes: []
    })
    expect(controller.canPublish.value).toBe(false)
    controller.applyCheck({
      expectedVersion: 3,
      errorCodes: [],
      ready: false,
      warningCodes: ['COPYRIGHT_REVIEW']
    })
    expect(controller.canPublish.value).toBe(false)
    controller.setWarningAcknowledged('COPYRIGHT_REVIEW', true)
    expect(controller.canPublish.value).toBe(true)
  })

  it('retains the check result after a publish conflict', async () => {
    const failure = new ApiError({
      code: 'PUBLISH_CHECK_FAILED',
      message: '检查已变化',
      requestId: 'r1',
      status: 409
    })
    const publish = vi.fn().mockRejectedValue(failure)
    const controller = usePublishCheck(adapter({ publish }), 'revision-1')
    controller.applyCheck({ expectedVersion: 3, errorCodes: [], ready: true, warningCodes: [] })
    await expect(controller.publish()).rejects.toBe(failure)
    expect(controller.result.value?.ready).toBe(true)
    expect(controller.hasConflict.value).toBe(true)
  })
})

/**
 * 创建发布检查测试使用的适配器
 *
 * @param overrides - 需要覆盖的适配器方法
 * @returns 带默认桩函数的发布适配器
 */
function adapter(overrides: Record<string, unknown> = {}) {
  return {
    check: vi.fn(),
    offline: vi.fn(),
    publish: vi.fn(),
    ...overrides
  }
}

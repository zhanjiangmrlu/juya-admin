import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import type { DashboardAdapter, DashboardSnapshotDto } from './dashboard-adapter'

import { useDashboard } from './use-dashboard'

const snapshot: DashboardSnapshotDto = {
  active_users: 42,
  expiring_entitlements: 8,
  failed_jobs: 1,
  open_feedback: 7,
  overdue_feedback: 2
}

/**
 * 创建工作台测试使用的成功适配器
 *
 * @returns 返回固定快照和空待办的适配器
 */
function createAdapter(): DashboardAdapter {
  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    getWorkItems: vi.fn().mockResolvedValue([])
  }
}

/**
 * 等待当前微任务队列完成
 *
 * @returns 微任务完成后的 Promise
 */
async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls the dashboard every 30 seconds', async () => {
    const adapter = createAdapter()
    const scope = effectScope()
    const controller = scope.run(() => useDashboard(adapter))!

    controller.start()
    await flushPromises()
    expect(adapter.getSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(adapter.getSnapshot).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('pauses polling while the page is hidden and refreshes after it becomes visible', async () => {
    const adapter = createAdapter()
    const scope = effectScope()
    const controller = scope.run(() => useDashboard(adapter))!
    controller.start()
    await flushPromises()

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(adapter.getSnapshot).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(adapter.getSnapshot).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('does not expose AbortError as a dashboard error', async () => {
    const adapter = createAdapter()
    vi.mocked(adapter.getSnapshot).mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    )
    const scope = effectScope()
    const controller = scope.run(() => useDashboard(adapter))!

    await controller.load()

    expect(controller.error.value).toBeNull()
    scope.stop()
  })
})

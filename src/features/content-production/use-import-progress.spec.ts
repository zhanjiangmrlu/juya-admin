import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { ProductionSchema as S } from './work-order-model'

import { useImportProgress } from './use-import-progress'

/**
 * 创建当前工作单的导入响应，status 为实际批次状态，id 为归属工作单
 * @param status - 服务端状态
 * @param id - 服务端工作单身份
 * @returns 当前操作结果或完成状态
 */
const preview = (status = 'PENDING', id = 'one') =>
  ({
    work_order_id: id,
    batch_id: `batch-${id}`,
    status,
    preview_hash: 'a',
    preview_version: 1,
    items: [],
    batch_issues: [],
    unreferenced_files: []
  }) as S['ImportPreview']

/**
 * 创建真实生命周期作用域和可控接口，供读取状态与可见性场景验证
 * @returns 当前操作结果或完成状态
 */
const setup = () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const read = vi.fn().mockResolvedValue(preview())
  const stages = vi.fn().mockResolvedValue([{ stage: 'VALIDATE', status: 'QUEUED' }])
  const ready = vi.fn().mockResolvedValue(undefined)
  const scope = effectScope()
  const model = scope.run(() => useImportProgress({ read, stages, ready }))!
  return { model, read, stages, ready, scope }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('导入校验自动更新', () => {
  it('阶段已明确失败时立即结束等待，不自动重试业务阶段', async () => {
    const t = setup()
    t.stages.mockResolvedValue([
      { stage: 'VALIDATE', status: 'FAILED', error_code: 'IMPORT_DOCX_INVALID' }
    ])
    await t.model.start('one')
    expect(t.model.state.value).toBe('failed')
    expect(t.model.message.value).toBe('IMPORT_DOCX_INVALID')
    await vi.advanceTimersByTimeAsync(6000)
    expect(t.read).toHaveBeenCalledOnce()
    t.scope.stop()
  })

  it('耗时提示只说明等待，不把长耗时当作失败或伪造百分比', async () => {
    const t = setup()
    await t.model.start('one')
    await vi.advanceTimersByTimeAsync(60000)
    expect(t.model.longRunning.value).toBe(true)
    expect(t.model.state.value).toBe('waiting')
    t.scope.stop()
  })
  it('立即读取并依实际阶段排队、运行，到预览就绪后停止读取', async () => {
    const t = setup()
    await t.model.start('one')
    expect(t.read).toHaveBeenCalledTimes(1)
    expect(t.model.state.value).toBe('waiting')
    t.stages.mockResolvedValue([{ stage: 'VALIDATE', status: 'RUNNING' }])
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.model.state.value).toBe('checking')
    t.read.mockResolvedValue(preview('PREVIEW_READY'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.model.state.value).toBe('ready')
    expect(t.ready).toHaveBeenCalledOnce()
    const count = t.read.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.read).toHaveBeenCalledTimes(count)
    t.scope.stop()
  })

  it('慢请求不重叠，旧工作单的延迟响应不能覆盖新工作单', async () => {
    const t = setup()
    let complete!: (p: S['ImportPreview']) => void
    t.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const first = t.model.start('one')
    await vi.advanceTimersByTimeAsync(6000)
    expect(t.read).toHaveBeenCalledOnce()
    t.read.mockResolvedValue(preview('PREVIEW_READY', 'two'))
    await t.model.start('two')
    complete(preview('PREVIEW_READY'))
    await first
    expect(t.model.preview.value?.work_order_id).toBe('two')
    expect(t.ready).toHaveBeenCalledTimes(1)
    t.scope.stop()
  })

  it('连续三次网络失败后暂停，重新连接只读取、不重做业务操作', async () => {
    const t = setup()
    t.read.mockRejectedValue(new TypeError('network'))
    await t.model.start('one')
    await vi.advanceTimersByTimeAsync(4000)
    expect(t.model.state.value).toBe('disconnected')
    expect(t.read).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.read).toHaveBeenCalledTimes(3)
    t.read.mockResolvedValue(preview('PREVIEW_READY'))
    await t.model.reconnect()
    expect(t.model.state.value).toBe('ready')
    t.scope.stop()
  })

  it.each(['FAILED', 'CANCELLED'])('批次%s结束等待，不继续轮询', async (status) => {
    const t = setup()
    t.read.mockResolvedValue(preview(status))
    await t.model.start('one')
    expect(t.model.state.value).toBe(status.toLowerCase())
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.read).toHaveBeenCalledOnce()
    t.scope.stop()
  })

  it('不可用阶段不猜测状态，登录失效立即停止', async () => {
    const t = setup()
    t.stages.mockResolvedValue([])
    await t.model.start('one')
    expect(t.model.state.value).toBe('loading')
    t.read.mockRejectedValue(
      new ApiError({ status: 401, code: 'SESSION_EXPIRED', message: '请登录', requestId: 'x' })
    )
    await vi.advanceTimersByTimeAsync(2000)
    expect(t.model.state.value).toBe('error')
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.read).toHaveBeenCalledTimes(2)
    t.scope.stop()
  })

  it('隐藏页暂停、恢复可见立即读取，卸载后清理定时器和请求', async () => {
    const t = setup()
    await t.model.start('one')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(6000)
    expect(t.read).toHaveBeenCalledOnce()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(t.read).toHaveBeenCalledTimes(2)
    const signal = t.read.mock.calls.at(-1)?.[1] as AbortSignal
    t.scope.stop()
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(t.read).toHaveBeenCalledTimes(2)
  })
})

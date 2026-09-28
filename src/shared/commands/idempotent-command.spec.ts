import { describe, expect, it, vi } from 'vitest'

import { useIdempotentCommand } from './idempotent-command'

describe('idempotent command controller', () => {
  it('reuses the same key for a retry and rotates it when the input changes', async () => {
    const keys = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => keys.shift() as `${string}-${string}-${string}-${string}-${string}`
    )
    const keysDuringSameOperation: string[] = []
    const execute = vi
      .fn<(input: { reason: string }, idempotencyKey: string) => Promise<string>>()
      .mockImplementationOnce(async (_input, key) => {
        keysDuringSameOperation.push(key)
        throw new Error('temporary failure')
      })
      .mockImplementationOnce(async (_input, key) => {
        keysDuringSameOperation.push(key)
        return 'done'
      })
    const controller = useIdempotentCommand(execute)
    const input = { reason: '首次提交' }

    await expect(controller.submit(input)).rejects.toThrow('temporary failure')
    await expect(controller.retry()).resolves.toBe('done')

    expect(keysDuringSameOperation).toEqual([
      'idem-11111111-1111-4111-8111-111111111111',
      'idem-11111111-1111-4111-8111-111111111111'
    ])
    controller.reset({ reason: '新的业务输入' })
    expect(controller.idempotencyKey.value).toBe('idem-22222222-2222-4222-8222-222222222222')
  })

  it('rejects retry before any input has been submitted', async () => {
    const controller = useIdempotentCommand(async () => 'done')

    await expect(controller.retry()).rejects.toThrow('没有可重试的命令')
  })
})

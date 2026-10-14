import { describe, expect, it, vi } from 'vitest'

import { useIdempotentCommand } from './idempotent-command'

describe('idempotent command controller', () => {
  it.each(['success', 'error'] as const)(
    'keeps a reset command idle after old %s arrives',
    async (outcome) => {
      let resolve!: (value: string) => void
      let reject!: (reason: unknown) => void
      const controller = useIdempotentCommand(
        () =>
          new Promise<string>((done, fail) => {
            resolve = done
            reject = fail
          })
      )
      const old = controller.submit({ user: 'A' }).catch((failure) => failure)
      controller.reset({ user: 'B' })
      if (outcome === 'success') resolve('A-RECEIPT')
      else reject(new TypeError('A failed late'))
      await old
      expect(controller.state.value).toBe('idle')
      expect(controller.result.value).toBeNull()
      expect(controller.error.value).toBeNull()
      expect(controller.input.value).toEqual({ user: 'B' })
    }
  )

  it.each(['success', 'error'] as const)(
    'preserves B pending state, result and error after late A %s',
    async (outcome) => {
      let resolveA!: (value: string) => void
      let rejectA!: (reason: unknown) => void
      let resolveB!: (value: string) => void
      const execute = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<string>((done, fail) => {
              resolveA = done
              rejectA = fail
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<string>((done) => {
              resolveB = done
            })
        )
      const controller = useIdempotentCommand(execute)
      const old = controller.submit({ user: 'A' }).catch((failure) => failure)
      controller.reset({ user: 'B' })
      const current = controller.submit({ user: 'B' })
      if (outcome === 'success') resolveA('A-RECEIPT')
      else rejectA(new TypeError('A failed late'))
      await old
      expect(controller.state.value).toBe('submitting')
      expect(controller.result.value).toBeNull()
      expect(controller.error.value).toBeNull()
      resolveB('B-RECEIPT')
      await expect(current).resolves.toBe('B-RECEIPT')
      expect(controller.state.value).toBe('success')
      expect(controller.result.value).toBe('B-RECEIPT')
    }
  )
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

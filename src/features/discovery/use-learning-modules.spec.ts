import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useLearningModules } from './use-learning-modules'

const rows = [
  {
    type: 'scene_learning',
    name: '场景学习',
    order: 0,
    enabled: true,
    version: 2,
    ready: true,
    reason: null,
    entryPath: '/pages/scenes'
  },
  {
    type: 'grammar',
    name: '语法',
    order: 3,
    enabled: false,
    version: 1,
    ready: false,
    reason: 'MODULE_NOT_IMPLEMENTED',
    entryPath: '/pages/grammar'
  }
]

describe('learning module metadata', () => {
  it('edits actual name and order with the module version and stable retry identity', async () => {
    const save = vi.fn().mockRejectedValue(new Error('response lost'))
    const controller = useLearningModules({ load: vi.fn(async () => structuredClone(rows)), save })
    await controller.load()
    controller.rows.value[0]!.name = '我的场景'
    controller.rows.value[0]!.order = 5
    await controller.save('scene_learning')
    await controller.save('scene_learning')
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的场景', order: 5, version: 2 }),
      expect.any(String)
    )
    expect(save.mock.calls[0]?.[1]).toBe(save.mock.calls[1]?.[1])
    controller.rows.value[0]!.order = 6
    await controller.save('scene_learning')
    expect(save.mock.calls[2]?.[1]).not.toBe(save.mock.calls[0]?.[1])
  })
  it('uses readiness to reject enabling an unimplemented module while allowing its metadata update', async () => {
    const save = vi.fn(async (row) => ({ ...row, version: 2 }))
    const controller = useLearningModules({ load: vi.fn(async () => structuredClone(rows)), save })
    await controller.load()
    controller.rows.value[1]!.enabled = true
    await controller.save('grammar')
    expect(save).not.toHaveBeenCalled()
    expect(controller.error.value).toContain('准备')
    controller.rows.value[1]!.enabled = false
    controller.rows.value[1]!.name = '语法训练'
    await controller.save('grammar')
    expect(save).toHaveBeenCalledOnce()
  })
  it('retains local metadata on conflict until explicit reload', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFIG_VERSION_CONFLICT',
        message: '配置已变化',
        requestId: 'test'
      })
    )
    const controller = useLearningModules({ load: vi.fn(async () => structuredClone(rows)), save })
    await controller.load()
    controller.rows.value[0]!.name = '保留输入'
    await controller.save('scene_learning')
    expect(controller.rows.value[0]!.name).toBe('保留输入')
    await controller.save('scene_learning')
    expect(save).toHaveBeenCalledOnce()
    await controller.load()
    expect(controller.rows.value[0]!.name).toBe('场景学习')
  })
  it('rejects blank names and out-of-range sort values without writing', async () => {
    const save = vi.fn()
    const controller = useLearningModules({ load: vi.fn(async () => structuredClone(rows)), save })
    await controller.load()
    controller.rows.value[0]!.name = '  '
    await controller.save('scene_learning')
    controller.rows.value[0]!.name = '场景'
    controller.rows.value[0]!.order = 65536
    await controller.save('scene_learning')
    expect(save).not.toHaveBeenCalled()
  })
})

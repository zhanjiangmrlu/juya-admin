import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PronunciationStatusPanel from './pronunciation-status-panel.vue'

const adapter = vi.hoisted(() => ({
  available: true,
  status: vi.fn(),
  preview: vi.fn(),
  recover: vi.fn()
}))
vi.mock('./pronunciation-admin-adapter', () => ({ createPronunciationAdminAdapter: () => adapter }))
vi.mock('@/services/api/use-admin-api-client', () => ({ useAdminApiClient: () => ({}) }))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.resetAllMocks()
})
/**
 * 读取已确认目标的独立状态夹具
 * @param status - 实际任务状态
 * @returns 不允许新增收费调用的固定目标
 */
const fact = (status: string) => ({
  target_id: 'TARGET-A',
  target_status: 'CONFIRMED',
  target_type: 'WORD',
  allow_synthesis: false,
  synthesis_enabled: false,
  source: 'CACHE',
  resource_version: 'FIXED-A',
  task: { public_id: 'TASK-A', status, attempt: 1, error_code: null },
  attempts: []
})
/**
 * 装载真实控件与可观察的安全命令
 * @returns 当前面板测试实例
 */
const panel = () => {
  const wrapper = mount(PronunciationStatusPanel, {
    props: { targetId: 'TARGET-A' },
    global: { plugins: [ElementPlus] }
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('pronunciation administrative observation', () => {
  it('does not expose a recovery command for UNKNOWN paid outcomes', async () => {
    adapter.status.mockResolvedValue(fact('UNKNOWN'))
    const wrapper = panel()
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('UNKNOWN')
    expect(wrapper.text()).not.toContain('恢复本地发音处理')
    expect(adapter.recover).not.toHaveBeenCalled()
    expect(adapter.preview).not.toHaveBeenCalled()
  })
  it('ignores delayed fixed-file previews when target identity changes', async () => {
    adapter.status.mockResolvedValue(fact('SUCCEEDED'))
    let resolve!: (value: { resource_version: string; url: string }) => void
    adapter.preview.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const wrapper = panel()
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '试听固定发音资源')!
      .trigger('click')
    await wrapper.setProps({ targetId: 'TARGET-B' })
    resolve({ resource_version: 'FIXED-A', url: '/old-file.wav' })
    await flushPromises()
    expect(wrapper.find('audio').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('FIXED-A')
  })
  it('requires explicit confirmation for RECOVER and checks the no-charge receipt', async () => {
    adapter.status.mockResolvedValue(fact('RECOVER'))
    adapter.recover.mockResolvedValue({ task_id: 'TASK-A', status: 'RECOVER', paid_retry: true })
    const wrapper = panel()
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    const recover = wrapper
      .findAll('button')
      .find((button) => button.text() === '恢复本地发音处理')!
    expect(recover.attributes('disabled')).toBeDefined()
    await wrapper.get('input[type=checkbox]').setValue(true)
    await recover.trigger('click')
    await flushPromises()
    expect(adapter.recover).toHaveBeenCalledWith('TASK-A')
    expect(wrapper.text()).toContain('恢复回执未确认本地阶段')
    expect(adapter.status).toHaveBeenCalledTimes(1)
  })
})

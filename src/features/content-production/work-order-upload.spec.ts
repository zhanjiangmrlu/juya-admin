import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElUpload } from 'element-plus'
import { describe, expect, it, vi } from 'vitest'

import WorkOrderUpload from './work-order-upload.vue'

const shared = vi.hoisted(() => ({ request: vi.fn(), replace: vi.fn() }))
vi.mock('@/services/api/use-admin-api-client', () => ({
  useAdminApiClient: () => ({ request: shared.request })
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: shared.replace }) }))

describe('工作单上传等待', () => {
  it('上传进度自动展示，100%仍等待响应，期间不能替换文件且失败重试复用幂等键', async () => {
    let reject!: (e: Error) => void
    shared.request.mockReset()
    shared.replace.mockReset()
    shared.request.mockImplementation((input) =>
      input.method === 'GET'
        ? Promise.resolve({ max_package_bytes: 10000, max_items: 1000 })
        : new Promise((_resolve, fail) => {
            reject = fail
          })
    )
    const wrapper = mount(WorkOrderUpload, {
      props: { seriesId: 'series', contentType: 'dialogue', kind: 'zip' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    const file = new File(['data'], 'three.zip')
    wrapper.findComponent(ElUpload).vm.$emit('change', { name: file.name, raw: file })
    await flushPromises()
    const upload = wrapper.findAll('button').find((b) => b.text() === '开始校验')!
    await upload.trigger('click')
    const first = shared.request.mock.calls.find(([r]) => r.method === 'POST')![0]
    expect(first.onUploadProgress).toEqual(expect.any(Function))
    first.onUploadProgress(25)
    await flushPromises()
    expect(wrapper.text()).toContain('25%')
    expect(wrapper.findComponent(ElUpload).props('disabled')).toBe(true)
    first.onUploadProgress(100)
    await flushPromises()
    expect(wrapper.text()).toContain('文件传输完成，等待服务器确认')
    expect(shared.replace).not.toHaveBeenCalled()
    await upload.trigger('click')
    expect(shared.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    reject(new TypeError('network'))
    await flushPromises()
    await upload.trigger('click')
    const posts = shared.request.mock.calls.filter(([r]) => r.method === 'POST')
    expect(posts[1][0].headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
    wrapper.unmount()
  })
})

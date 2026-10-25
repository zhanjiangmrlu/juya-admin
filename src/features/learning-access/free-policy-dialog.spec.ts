import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import FreePolicyDialog from './free-policy-dialog.vue'

it('requires a valid quantity and a server preview before saving; cancel never mutates', async () => {
  request.mockReset().mockResolvedValue({ enabled: false, free_count: null, revision: 0 })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: FreePolicyDialog }]
  })
  await router.push('/')
  const page = mount(FreePolicyDialog, {
    global: {
      plugins: [router],
      stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
    }
  })
  await flushPromises()
  expect(page.get('input').element.value).toBe('')
  await page
    .findAll('button')
    .find((b) => b.text() === '核对免费名单')!
    .trigger('click')
  expect(page.text()).toContain('请输入非负整数')
  expect(request.mock.calls).toHaveLength(1)
  await page.get('input').setValue('0')
  request.mockResolvedValueOnce({
    enabled: false,
    free_count: null,
    revision: 0,
    proposed_count: 0,
    total: 0,
    page: 1,
    limit: 10,
    items: [],
    added_count: 0,
    removed_count: 0,
    removed: [],
    preview_token: 'server-confirmed-zero'
  })
  await page
    .findAll('button')
    .find((b) => b.text() === '核对免费名单')!
    .trigger('click')
  await flushPromises()
  expect(page.text()).toContain('实际免费 0 张')
  await page
    .findAll('button')
    .find((b) => b.text() === '取消')!
    .trigger('click')
  expect(page.emitted('close')).toHaveLength(1)
  expect(request.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false)
  page.unmount()
})

import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/http-client')>()),
  api: { request }
}))
import SceneCatalogOrder from './scene-catalog-order.vue'
it('keeps a rejected temporary order and rebases new publications before another explicit save', async () => {
  let reads = 0
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') throw new Error('已发布卡片或顺序已变化')
    reads++
    return {
      version: reads === 1 ? 'initial' : 'current',
      items:
        reads === 1
          ? [
              { id: 'one', name: 'First', image_id: null },
              { id: 'two', name: 'Second', image_id: null }
            ]
          : [
              { id: 'one', name: 'First', image_id: null },
              { id: 'two', name: 'Second', image_id: null },
              { id: 'three', name: 'New', image_id: null }
            ]
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cards', component: SceneCatalogOrder }]
  })
  await router.push('/cards')
  await router.isReady()
  const page = mount(
    { template: '<RouterView />' },
    {
      global: {
        plugins: [router],
        stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
      }
    }
  )
  try {
    await flushPromises()
    await page.get('[aria-label="上移 Second"]').trigger('click')
    await page.get('[data-action="save-order"]').trigger('click')
    await flushPromises()
    expect(page.findAll('.catalog-name').map((item) => item.text())).toEqual(['Second', 'First'])
    expect(page.text()).toContain('已发布卡片或顺序已变化')
    await page.get('[data-action="refresh-order"]').trigger('click')
    await flushPromises()
    expect(page.findAll('.catalog-name').map((item) => item.text())).toEqual([
      'Second',
      'First',
      'New'
    ])
    expect(page.text()).toContain('请核对后再保存')
  } finally {
    page.unmount()
  }
})

it('uses the latest official order when refresh has no local changes to preserve', async () => {
  request.mockReset()
  request.mockResolvedValueOnce({
    version: 'one',
    items: [
      { id: 'one', name: 'First', image_id: null },
      { id: 'two', name: 'Second', image_id: null }
    ]
  })
  request.mockResolvedValueOnce({
    version: 'two',
    items: [
      { id: 'two', name: 'Second', image_id: null },
      { id: 'one', name: 'First', image_id: null }
    ]
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cards', component: SceneCatalogOrder }]
  })
  await router.push('/cards')
  await router.isReady()
  const page = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  try {
    await flushPromises()
    await page.get('[data-action="refresh-order"]').trigger('click')
    await flushPromises()
    expect(page.findAll('.catalog-name').map((item) => item.text())).toEqual(['Second', 'First'])
    expect(page.text()).toContain('当前已保存顺序')
  } finally {
    page.unmount()
  }
})

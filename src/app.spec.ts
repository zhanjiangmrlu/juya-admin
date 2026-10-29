import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import { registerLogoutGuard } from '@/services/logout-guard'
import { useAdminStore } from '@/stores/admin-store'

import App from './App.vue'
it('confirms unsaved editor departure before revoking the administrator session', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const admin = useAdminStore()
  admin.identity = { id: 'admin-1', username: 'admin' }
  admin.checked = true
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/cards', '/users', '/statistics', '/login'].map((path) => ({
      path,
      component: { template: '<p>内容</p>' }
    }))
  })
  await router.push('/cards')
  const guard = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const cleanup = registerLogoutGuard(guard)
  network.mockResolvedValue(Response.json({ logged_out: true }))
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(network).not.toHaveBeenCalled()
  expect(admin.identity).not.toBeNull()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(network).toHaveBeenCalledTimes(1)
  expect(router.currentRoute.value.path).toBe('/login')
  cleanup()
  wrapper.unmount()
})
it('refreshes the Beijing header date across midnight without duplicate listening breadcrumbs', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-28T15:59:59Z'))
  const pinia = createPinia()
  setActivePinia(pinia)
  const admin = useAdminStore()
  admin.identity = { id: 'admin-1', username: 'admin' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/listening/categories',
        meta: { title: '听读管理' },
        component: { template: '<p>分类</p>' }
      }
    ]
  })
  await router.push('/listening/categories')
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  try {
    expect(wrapper.get('.workspace-bar').text()).not.toContain('听读管理 / 听读管理')
    expect(wrapper.get('.workspace-bar').text()).toContain('2026-10-28')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.get('.workspace-bar').text()).toContain('2026-10-29')
  } finally {
    wrapper.unmount()
    vi.useRealTimers()
  }
})

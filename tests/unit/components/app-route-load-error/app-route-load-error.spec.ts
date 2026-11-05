import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter, onBeforeRouteLeave } from 'vue-router'

import App from '@/App.vue'
import SceneListPage from '@/pages/scenes/scene-list-page.vue'
import { useAdminStore } from '@/stores/admin-store'

import type { RouteRecordRaw } from 'vue-router'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))

const listPath = '/cards?batch_id=import-batch&status=draft&search=wetland&page=2'
let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

/** 挂载真实列表、应用外壳和路由，编辑页加载器由场景控制
 * @param editor 当前场景的编辑页路由配置
 * @returns 可点击真实编辑链接的应用与路由
 */
const mountNavigation = async (editor: RouteRecordRaw) => {
  request.mockImplementation(async (path: string) =>
    path.startsWith('/api/admin/v1/cards?')
      ? {
          items: [
            {
              id: 'draft-card',
              display_name: '湿地实地考察',
              display_title_en: 'A Wetland Field Study',
              status: 'draft',
              content: { name: '湿地实地考察' },
              issues: [],
              updated_at: ''
            }
          ],
          page: 2,
          total: 11,
          total_pages: 2,
          limit: 10
        }
      : []
  )
  const pinia = createPinia()
  useAdminStore(pinia).identity = { id: 'admin', username: 'admin' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards', component: SceneListPage },
      editor,
      { path: '/:pathMatch(.*)*', component: { template: '<p>其他页面</p>' } }
    ]
  })
  await router.push(listPath)
  const wrapper = mount(App, { global: { plugins: [pinia, router], stubs: { ElDialog: true } } })
  cleanup = () => wrapper.unmount()
  await flushPromises()
  return { router, wrapper }
}

it.each([
  'Failed to fetch dynamically imported module: /assets/scene-edit-page-old.js',
  'Importing a module script failed.',
  'error loading dynamically imported module: /assets/scene-edit-page-old.js',
  'Unable to preload CSS for /assets/scene-edit-page-old.css'
])('offers an explicit refresh to the intended edit URL after %s', async (message) => {
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: () => Promise.reject(new TypeError(message))
  })
  const edit = wrapper.findAll('a').find((link) => link.text() === '编辑')!
  const destination = edit.attributes('href')!
  await edit.trigger('click')
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe(listPath)
  const alert = wrapper.get('[role="alert"]')
  expect(alert.text()).toContain('页面资源加载失败')
  expect(alert.get('a').text()).toBe('刷新页面并继续')
  expect(alert.get('a').attributes('href')).toBe(destination)
  expect(router.resolve(destination).query.back).toBe(listPath)

  await router.push('/statistics')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('keeps the batch query and list position through normal edit and return navigation', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal('scrollY', 420)
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: {
      template: '<div>编辑场景卡<RouterLink :to="$route.query.back">返回列表</RouterLink></div>'
    }
  })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/cards/draft-card')
  expect(router.currentRoute.value.query.back).toBe(listPath)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)

  await wrapper
    .findAll('a')
    .find((link) => link.text() === '返回列表')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(listPath)
  expect(scroll).toHaveBeenLastCalledWith(0, 420)
})

it('preserves a pending-operation leave guard before loading another route', async () => {
  const load = vi.fn(() =>
    Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
  )
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: {
      setup() {
        onBeforeRouteLeave(() => false)
      },
      template: '<div>待确认操作<RouterLink to="/imports">离开</RouterLink></div>'
    }
  })
  router.addRoute({ path: '/imports', component: load })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '离开')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/cards/draft-card')
  expect(load).not.toHaveBeenCalled()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('does not offer a page refresh for unrelated route errors', async () => {
  const { wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: () => Promise.reject(new Error('permission denied'))
  })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('rechecks late unsaved edits before following the recovery link', async () => {
  const dirty = ref(false)
  const guard = vi.fn(() => !dirty.value || window.confirm('尚有未保存修改，是否离开？'))
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: {
      setup() {
        onBeforeRouteLeave(guard)
        return { dirty }
      },
      template: '<input v-model="dirty" type="checkbox" aria-label="继续修改" />'
    }
  })
  router.addRoute({
    path: '/imports',
    component: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
  })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  await router.push('/imports').catch(() => {})
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('页面资源加载失败')
  expect(guard).toHaveBeenCalledTimes(1)

  await wrapper.get('input[aria-label="继续修改"]').setValue(true)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  wrapper.get('[role="alert"] a').element.dispatchEvent(click)
  await flushPromises()
  expect(guard).toHaveBeenCalledTimes(2)
  expect(window.confirm).toHaveBeenCalledOnce()
  expect(click.defaultPrevented).toBe(true)
  expect(router.currentRoute.value.path).toBe('/cards/draft-card')
  expect(wrapper.get('input[aria-label="继续修改"]').element).toHaveProperty('checked', true)
  expect(wrapper.get('[role="alert"] a').attributes('href')).toBe('/imports')
})

it('uses normal navigation when retrying the resource succeeds', async () => {
  let attempts = 0
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: () =>
      attempts++ === 0
        ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
        : Promise.resolve({ template: '<p>编辑场景卡</p>' })
  })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  wrapper.get('[role="alert"] a').element.dispatchEvent(click)
  await flushPromises()
  expect(click.defaultPrevented).toBe(true)
  expect(router.currentRoute.value.path).toBe('/cards/draft-card')
  expect(router.currentRoute.value.query.back).toBe(listPath)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('keeps recovery on the page when a retry has an unrelated error', async () => {
  let attempts = 0
  const { router, wrapper } = await mountNavigation({
    path: '/cards/:id',
    component: () =>
      Promise.reject(
        new Error(
          attempts++ === 0 ? 'Failed to fetch dynamically imported module' : 'permission denied'
        )
      )
  })
  await wrapper
    .findAll('a')
    .find((link) => link.text() === '编辑')!
    .trigger('click')
  await flushPromises()
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  wrapper.get('[role="alert"] a').element.dispatchEvent(click)
  await flushPromises()
  expect(click.defaultPrevented).toBe(true)
  expect(attempts).toBe(2)
  expect(router.currentRoute.value.fullPath).toBe(listPath)
  expect(wrapper.get('[role="alert"]').text()).toContain('页面资源加载失败')
})

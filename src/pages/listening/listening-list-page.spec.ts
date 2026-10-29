import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { emptyPayload } from '@/features/listening/listening-model'

const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningListPage from './listening-list-page.vue'

const article = (id: string) => ({
  id,
  topic_id: 't',
  status: 'published',
  revision: 3,
  version_id: 'v',
  topic_order: 1,
  global_order: 1,
  payload: { ...emptyPayload(), title_zh: `文章${id}`, title_en: `Article ${id}` },
  word_count: 3,
  timeline: { state: 'missing' },
  created_at: '2026-10-28T00:00:00Z',
  deleted_at: null
})
beforeEach(() => {
  network.mockReset()
  network.mockImplementation(async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/categories'))
      return Response.json({ items: [{ id: 'c', name: '日常生活', sort_order: 1, revision: 1 }] })
    if (path.endsWith('/topics'))
      return Response.json({
        items: [{ id: 't', category_id: 'c', name: '晨间习惯', sort_order: 1, revision: 1 }]
      })
    if (path.endsWith('/free-policy'))
      return Response.json({ configured: true, free_count: 1, revision: 1, article_ids: ['1'] })
    if (path.endsWith('/preview')) return Response.json({ article: article('1') })
    if (path.endsWith('/batch-delete'))
      return Response.json({ items: [{ id: '1', status: 'success' }] })
    return Response.json({ items: [article('1'), article('2')], total: 2, page: 1, limit: 10 })
  })
})
const open = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening', component: ListeningListPage },
      { path: '/listening/:id', component: { template: '<div>文章编辑</div>' } },
      { path: '/listening-imports', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening')
  const page = mount(
    { template: '<RouterView />' },
    {
      attachTo: document.body,
      global: {
        plugins: [router],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>'
          }
        }
      }
    }
  )
  await flushPromises()
  return { page, router }
}
it('shows category/topic ownership, real free membership and audio status for each row', async () => {
  const { page } = await open()
  expect(page.get('tbody').text()).toContain('日常生活 / 晨间习惯')
  expect(page.get('tbody').text()).toContain('免费开放')
  expect(page.get('tbody').text()).toContain('需学习授权')
  expect(page.get('tbody').text()).toContain('音频待补充')
  page.unmount()
})
it('single-row deletion does not include another checked article and cancel retains selection', async () => {
  const { page } = await open()
  await page.get('tbody tr:nth-child(2) input').setValue(true)
  await page.get('tbody tr:first-child .danger').trigger('click')
  expect(page.text()).toContain('确认删除1篇')
  await page
    .findAll('button')
    .find((item) => item.text() === '取消')!
    .trigger('click')
  expect((page.get('tbody tr:nth-child(2) input').element as HTMLInputElement).checked).toBe(true)
  await page.get('tbody tr:first-child .danger').trigger('click')
  await page
    .findAll('button')
    .find((item) => item.text() === '确认删除1篇')!
    .trigger('click')
  await flushPromises()
  const write = network.mock.calls
    .map((item) => item[0] as Request)
    .find((request) => request.url.endsWith('/batch-delete'))!
  expect(await write.json()).toEqual({ items: [{ id: '1', revision: 3 }] })
  page.unmount()
})

it('returns from the full page preview to the same list selection and scroll position', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
  const { page, router } = await open()
  await page.get('tbody tr:nth-child(2) input').setValue(true)
  await page
    .get('tbody tr:first-child')
    .findAll('button')
    .find((button) => button.text() === '预览')!
    .trigger('click')
  await flushPromises()
  expect(
    page
      .findAll('h1')
      .filter((item) => item.isVisible())
      .map((item) => item.text())
  ).toEqual(['文章预览'])
  expect(router.currentRoute.value.fullPath).toBe('/listening')
  expect(scroll).toHaveBeenLastCalledWith(0, 0)
  await page
    .findAll('button')
    .find((button) => button.text() === '关闭预览')!
    .trigger('click')
  await flushPromises()
  expect(page.get('tbody').isVisible()).toBe(true)
  expect((page.get('tbody tr:nth-child(2) input').element as HTMLInputElement).checked).toBe(true)
  expect(scroll).toHaveBeenLastCalledWith(0, 420)
  page.unmount()
  scroll.mockRestore()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

it('keeps the list return destination when entering editing from full page preview', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const { page, router } = await open()
  await page
    .get('tbody tr:first-child')
    .findAll('button')
    .find((button) => button.text() === '预览')!
    .trigger('click')
  await flushPromises()
  const edit = page.findAll('a').find((link) => link.text() === '前往编辑并发布')!
  expect(edit.isVisible()).toBe(true)
  await edit.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/listening/1')
  expect(router.currentRoute.value.query.back).toBe('/listening')
  page.unmount()
  scroll.mockRestore()
})

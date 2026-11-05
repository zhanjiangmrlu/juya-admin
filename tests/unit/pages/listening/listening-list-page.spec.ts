import { flushPromises, mount } from '@vue/test-utils'
import { ElCheckbox, ElPagination, ElTable } from 'element-plus'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { emptyPayload } from '@/features/listening/listening-model'

const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningCatalogPage from '@/pages/listening/listening-catalog-page.vue'
import ListeningListPage from '@/pages/listening/listening-list-page.vue'

const article = (id: string) => ({
  id,
  category_id: 'c',
  category_name: '日常生活',
  is_free: id === '1',
  free_revision: 1,
  status: 'published',
  revision: 3,
  version_id: 'v',
  has_unpublished_changes: id === '2',
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
/** 挂载听读路由并按需复现应用缓存
 * @param cached 是否保留文章列表以验证 Tab 返回状态
 * @returns 页面包装器和用于验证导航的真实路由
 */
const open = async (cached = false) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening', component: ListeningListPage },
      {
        path: '/listening/categories',
        component: ListeningCatalogPage,
        meta: { listeningSurface: 'categories' }
      },
      { path: '/listening/:id', component: { template: '<div>文章编辑</div>' } },
      { path: '/listening-imports', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening')
  const page = mount(
    {
      template: cached
        ? '<RouterView v-slot="{ Component }"><KeepAlive :include="[\'ListeningListPage\']"><component :is="Component" /></KeepAlive></RouterView>'
        : '<RouterView />'
    },
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
it('shows direct category ownership, real free membership and audio status for each row', async () => {
  const { page } = await open()
  expect(page.get('tbody').text()).toContain('日常生活')
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

it('publishes only the checked article revisions without requiring a preview', async () => {
  const original = network.getMockImplementation()!
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/batch-publish')) {
      writes.push(request)
      return Response.json({
        items: [{ id: '2', status: 'success', published_version_id: 'v2', revision: 4 }]
      })
    }
    return original(request)
  })
  const { page } = await open()
  await page.get('tbody tr:nth-child(2) input').setValue(true)
  const publish = page
    .findAll('.selection-bar button')
    .find((item) => item.text().startsWith('批量发布'))
  expect(publish).toBeDefined()
  await publish!.trigger('click')
  await flushPromises()
  expect(writes).toHaveLength(1)
  expect(await writes[0]!.json()).toEqual({ items: [{ id: '2', revision: 3 }] })
  expect(page.findAll('th').map((item) => item.text())).not.toContain('学习范围')
  expect(page.findAll('th').map((item) => item.text())).toContain('状态')
  expect(page.find('.result-panel').exists()).toBe(false)
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

it('exposes only article/category tabs and per-row free actions instead of numeric or global settings', async () => {
  const { page } = await open()
  expect(page.text()).not.toContain('主题管理')
  expect(page.text()).not.toContain('全局免费排序')
  expect(page.text()).not.toContain('免费开放设置')
  expect(page.findAll('.free-access-control')).toHaveLength(2)
  page.unmount()
})

it('labels empty category and status filters in Chinese', async () => {
  const { page } = await open()
  const filters = page.get('.filters')
  expect(filters.text()).toContain('全部分类')
  expect(filters.text()).toContain('全部状态')
  expect(filters.text()).not.toContain('Select')
  page.unmount()
})

it('selects the matching tab on the first click when returning to a cached article list', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const { page, router } = await open(true)
  try {
    for (let round = 0; round < 3; round++) {
      await page.get('#tab-categories').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/listening/categories')
      expect(page.get('#tab-categories').attributes('aria-selected')).toBe('true')
      expect(page.get('h1').text()).toBe('分类管理')
      await page.get('#tab-articles').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/listening')
      expect(page.get('#tab-articles').attributes('aria-selected')).toBe('true')
      expect(page.get('h1').text()).toBe('听读文章管理')
    }
    router.back()
    await flushPromises()
    expect(page.get('#tab-categories').attributes('aria-selected')).toBe('true')
    router.forward()
    await flushPromises()
    expect(page.get('#tab-articles').attributes('aria-selected')).toBe('true')
  } finally {
    page.unmount()
    scroll.mockRestore()
  }
})

it('keeps controlled article selection and clears it on pagination and filter changes', async () => {
  const original = network.getMockImplementation()!
  network.mockImplementation(async (request: Request) => {
    if (new URL(request.url).pathname.endsWith('/articles'))
      return Response.json({ items: [article('1'), article('2')], total: 20, page: 1, limit: 10 })
    return original(request)
  })
  const { page, router } = await open()
  try {
    expect(page.findComponent(ElTable).exists()).toBe(true)
    await page.get('[aria-label="选择文章1"] input').setValue(true)
    const all = page
      .findAllComponents(ElCheckbox)
      .find((item) => item.attributes('aria-label') === '全选当前页文章')!
    expect(all.props('indeterminate')).toBe(true)
    await page.get('[aria-label="全选当前页文章"] input').setValue(true)
    expect(page.get('.selection-bar').text()).toContain('已选当前页 2 篇')
    await page.get('[aria-label="全选当前页文章"] input').setValue(false)
    expect(page.find('.selection-bar').exists()).toBe(false)
    await page.get('[aria-label="选择文章1"] input').setValue(true)
    await page.findComponent(ElPagination).get('.btn-next').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.page).toBe('2')
    expect(page.find('.selection-bar').exists()).toBe(false)
    await page.get('[aria-label="选择文章1"] input').setValue(true)
    await page.get('.filters input[aria-label="搜索中英文标题"]').setValue('coffee')
    await page.get('.filters').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ q: 'coffee', page: '1' })
    expect(page.find('.selection-bar').exists()).toBe(false)
  } finally {
    page.unmount()
  }
})

it('refreshes real free membership without losing current selection or scroll position', async () => {
  const original = network.getMockImplementation()!
  let enabled = false
  network.mockImplementation(async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/articles/2/free-access')) {
      enabled = true
      return Response.json({ is_free: true, revision: 2 })
    }
    if (path.endsWith('/articles'))
      return Response.json({
        items: [
          article('1'),
          { ...article('2'), is_free: enabled, free_revision: enabled ? 2 : 1 }
        ],
        total: 2,
        page: 1,
        limit: 10
      })
    if (path.endsWith('/free-policy'))
      return Response.json({ article_ids: enabled ? ['1', '2'] : ['1'], revision: 1 })
    return original(request)
  })
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
  const { page, router } = await open()
  try {
    await page.get('tbody tr:nth-child(2) input').setValue(true)
    await page.get('tbody tr:nth-child(2) .free-access-control button').trigger('click')
    await flushPromises()
    expect(page.get('tbody tr:nth-child(2)').text()).toContain('免费开放')
    expect(page.get('.free-overview').text()).toContain('当前免费听读 2 篇')
    expect(page.get('.selection-bar').text()).toContain('已选当前页 1 篇')
    expect(router.currentRoute.value.fullPath).toBe('/listening')
    expect(scroll).toHaveBeenLastCalledWith(0, 420)
  } finally {
    page.unmount()
    scroll.mockRestore()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  }
})

it('marks only failed article deletions and keeps retry limited to the original failures', async () => {
  const original = network.getMockImplementation()!
  network.mockImplementation(async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/batch-delete'))
      return Response.json({ items: [{ id: '1', status: 'failed', error: '资料已变化' }] })
    if (path.endsWith('/articles/1')) return Response.json(article('1'))
    return original(request)
  })
  const { page } = await open()
  try {
    await page.get('tbody tr:first-child .danger').trigger('click')
    await page
      .findAll('button')
      .find((button) => button.text() === '确认删除1篇')!
      .trigger('click')
    await flushPromises()
    expect(page.get('tbody tr:first-child').classes()).toContain('failed-row')
    expect(page.get('tbody tr:nth-child(2)').classes()).not.toContain('failed-row')
    await page
      .findAll('button')
      .find((button) => button.text() === '刷新并重新确认原失败项')!
      .trigger('click')
    await flushPromises()
    expect(page.get('.confirmation-objects').text()).toContain('文章1')
    expect(page.get('.confirmation-objects').text()).not.toContain('文章2')
  } finally {
    page.unmount()
  }
})

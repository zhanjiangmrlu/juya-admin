import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { emptyPayload } from '@/features/listening/listening-model'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningImportPage from './listening-import-page.vue'
it('loads every server-filtered unfinished page including an older batch beyond fifty', async () => {
  const pages: string[] = []
  network.mockImplementation(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/topics')) return Response.json({ items: [] })
    pages.push(url.search)
    const page = Number(url.searchParams.get('page'))
    return Response.json({
      total: 51,
      page,
      limit: 50,
      items: Array.from({ length: page === 1 ? 50 : 1 }, (_, index) => ({
        id: page === 1 ? `new-${index}` : 'old-partial',
        mode: 'zip',
        status: 'partial'
      }))
    })
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening-imports', component: ListeningImportPage },
      { path: '/listening', component: { template: '<div/>' } }
    ]
  })
  await router.push('/listening-imports')
  const page = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  expect(pages).toEqual(['?unfinished=true&page=1&limit=50', '?unfinished=true&page=2&limit=50'])
  expect(page.get('.resume-panel').text()).toContain('old-partial')
  expect(page.findAll('.resume-panel button')).toHaveLength(51)
  page.unmount()
})

it('selects a stable existing target, stages without writing articles and reviews differences before the final save', async () => {
  const oldPayload = { ...emptyPayload(), title_zh: '旧文章', body_en: 'Old text.' }
  const payload = { ...emptyPayload(), title_zh: '导入新稿', body_en: 'New text.' }
  const target = {
    id: 'existing',
    revision: 4,
    topic_id: 't',
    payload: oldPayload,
    status: 'published'
  }
  let batch = {
    id: 'b',
    mode: 'zip',
    revision: 1,
    status: 'review',
    packages: [],
    counts: { complete: 1 },
    candidates: [
      {
        id: 'c',
        package_id: 'p',
        path: 'content.docx',
        state: 'complete',
        payload,
        topic_id: 't',
        resources: { audio: [], image: [] },
        errors: [],
        removed: false,
        target_article_id: null as string | null,
        target_revision: null as number | null,
        article_id: null as string | null,
        duplicate_of: null,
        timeline: { state: 'missing' }
      }
    ]
  }
  const writes: { path: string; body: unknown }[] = []
  network.mockImplementation(async (request: Request) => {
    const path = new URL(request.url).pathname
    if (request.method !== 'GET') {
      const body = await request.json()
      writes.push({ path, body })
      if (path.endsWith('/candidates/c')) {
        batch = { ...batch, revision: 2, candidates: [{ ...batch.candidates[0]!, ...body }] }
        return Response.json(batch)
      }
      if (path.endsWith('/preview'))
        return Response.json({
          preview_token: 'confirmed',
          candidate_ids: ['c'],
          counts: { selected: 1, savable: 1, skipped: 0 },
          changes: [
            {
              candidate_id: 'c',
              operation: 'update',
              target_article_id: 'existing',
              target_revision: 4,
              before: { topic_id: 't', payload: oldPayload },
              after: { topic_id: 't', payload }
            }
          ]
        })
      if (path.endsWith('/save'))
        return Response.json({
          batch: {
            ...batch,
            status: 'saved',
            candidates: [{ ...batch.candidates[0]!, state: 'saved', article_id: 'existing' }]
          },
          items: [{ candidate_id: 'c', status: 'success', article_id: 'existing' }]
        })
      throw new Error(`Unexpected write ${path}`)
    }
    if (path.endsWith('/topics')) return Response.json({ items: [{ id: 't', name: '主题' }] })
    if (path.endsWith('/articles/existing')) return Response.json(target)
    if (path.endsWith('/articles'))
      return Response.json({ items: [target], total: 1, page: 1, limit: 10 })
    if (path.endsWith('/imports/b')) return Response.json(batch)
    return Response.json({ items: [], total: 0, page: 1, limit: 50 })
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening-imports', component: ListeningImportPage },
      { path: '/listening', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening-imports?batch_id=b')
  const page = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '核对 / 补充资料')!
    .trigger('click')
  await flushPromises()
  expect(page.text()).toContain('更新已有文章')
  await page.get('input[value="update"]').setValue(true)
  await page.get('input[aria-label="查找已有文章"]').setValue('旧文章')
  await page
    .findAll('button')
    .find((button) => button.text() === '搜索目标')!
    .trigger('click')
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '选择《旧文章》')!
    .trigger('click')
  await flushPromises()
  expect(page.get('.target-difference').text()).toContain('Old text.')
  expect(page.get('.target-difference').text()).toContain('New text.')
  await page
    .findAll('button')
    .find((button) => button.text() === '保存到本批暂存')!
    .trigger('click')
  await flushPromises()
  expect(writes).toEqual([
    {
      path: '/api/admin/v1/listening/imports/b/candidates/c',
      body: expect.objectContaining({ target_article_id: 'existing', target_revision: 4 })
    }
  ])
  await page
    .findAll('button')
    .find((button) => button.text() === '核对完成，下一步')!
    .trigger('click')
  await flushPromises()
  expect(page.get('.final-changes').text()).toContain('更新已有文章')
  expect(page.get('.final-changes').text()).toContain('Old text.')
  expect(page.get('.final-changes').text()).toContain('New text.')
  expect(writes.some((write) => write.path.endsWith('/save'))).toBe(false)
  await page
    .findAll('button')
    .find((button) => button.text() === '确认保存草稿')!
    .trigger('click')
  await flushPromises()
  expect(writes.at(-1)).toEqual({
    path: '/api/admin/v1/listening/imports/b/save',
    body: { preview_token: 'confirmed' }
  })
  expect(writes.every((write) => write.path.includes('/imports/'))).toBe(true)
  page.unmount()
})

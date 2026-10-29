import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/listening-service', () => ({
  listeningBase: '/api/admin/v1/listening',
  listeningRequest: request
}))
import ListeningPublishedPreviewPage from './listening-published-preview-page.vue'

enableAutoUnmount(afterEach)
beforeEach(() => {
  request.mockReset()
})
const article = {
  id: 'article',
  topic_id: 'published-topic',
  published_topic_id: 'published-topic',
  draft_topic_id: 'draft-topic',
  payload: { title_zh: '发布内容' },
  timeline: { state: 'missing' }
}
const categories = { items: [{ id: 'category', name: '日常生活' }] }
const topics = {
  items: [
    { id: 'published-topic', category_id: 'category', name: '午间休息' },
    { id: 'draft-topic', category_id: 'category', name: '未发布主题' }
  ]
}
/** 挂载发布预览页面，使用轻量面板观察快照及名称元数据
 * @returns 发布预览组件
 */
const open = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening/:id/published-preview', component: ListeningPublishedPreviewPage },
      { path: '/users', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening/article/published-preview')
  const page = mount(ListeningPublishedPreviewPage, {
    global: {
      plugins: [router],
      stubs: {
        ListeningPreviewPanel: {
          name: 'ListeningPreviewPanel',
          props: ['article', 'mediaBase', 'sourceLabel', 'readonly'],
          template: '<section />'
        }
      }
    }
  })
  await flushPromises()
  return page
}

it('loads the effective publication and resolves names from its published topic through read-only catalog queries', async () => {
  request.mockImplementation(async (path: string) => {
    if (path === '/categories') return categories
    if (path === '/topics') return topics
    if (path === '/articles/article/published') return article
    throw new Error(`Unexpected request: ${path}`)
  })
  const page = await open()
  expect(request.mock.calls.map(([path]) => path).sort()).toEqual([
    '/articles/article/published',
    '/categories',
    '/topics'
  ])
  expect(request.mock.calls.every((call) => call.length === 1)).toBe(true)
  expect(page.findComponent({ name: 'ListeningPreviewPanel' }).props()).toMatchObject({
    article: { ...article, category_name: '日常生活', topic_name: '午间休息' },
    readonly: true,
    mediaBase: '/api/admin/v1/listening/articles/article/published/media'
  })
  expect(page.text()).not.toContain('保存')
  expect(page.text()).not.toContain('确认发布')
})

it('renders the publication before catalog metadata finishes loading', async () => {
  let finishCategories!: (value: unknown) => void, finishTopics!: (value: unknown) => void
  request.mockImplementation((path: string) => {
    if (path === '/categories')
      return new Promise((resolve) => {
        finishCategories = resolve
      })
    if (path === '/topics')
      return new Promise((resolve) => {
        finishTopics = resolve
      })
    return Promise.resolve(article)
  })
  const page = await open()
  expect(page.findComponent({ name: 'ListeningPreviewPanel' }).props('article')).toMatchObject(
    article
  )
  expect(typeof finishCategories).toBe('function')
  expect(typeof finishTopics).toBe('function')
  finishCategories(categories)
  finishTopics(topics)
  await flushPromises()
  expect(page.findComponent({ name: 'ListeningPreviewPanel' }).props('article')).toMatchObject({
    payload: article.payload,
    category_name: '日常生活',
    topic_name: '午间休息'
  })
})

it('keeps the publication available when catalog queries fail without substituting identifiers for names', async () => {
  request.mockImplementation(async (path: string) => {
    if (path === '/articles/article/published') return article
    throw new Error('分类主题暂未获取')
  })
  const page = await open()
  const shown = page.findComponent({ name: 'ListeningPreviewPanel' }).props('article')
  expect(shown.payload).toEqual(article.payload)
  expect(shown.category_name).toBeUndefined()
  expect(shown.topic_name).toBeUndefined()
  expect(page.text()).not.toContain('分类主题暂未获取')
})

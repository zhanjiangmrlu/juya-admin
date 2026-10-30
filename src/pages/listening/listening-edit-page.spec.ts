import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { emptyPayload } from '@/features/listening/listening-model'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningEditPage from './listening-edit-page.vue'
const saved = {
  id: 'created',
  topic_id: 'topic',
  revision: 1,
  status: 'draft',
  payload: emptyPayload()
}
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  network.mockReset()
})
it('recovers the original creation receipt before saving changed input as an update', async () => {
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request?.method === 'GET' && request.url.endsWith('/categories'))
      return Response.json({ items: [] })
    if (request?.method === 'GET' && request.url.endsWith('/topics'))
      return Response.json({ items: [{ id: 'topic', name: '主题' }] })
    if (request.url.includes('/operations/'))
      return Response.json({ status: 'succeeded', result: saved })
    writes.push(request.clone())
    if (writes.length === 1) throw new Error('response lost after commit')
    return Response.json({ ...saved, revision: 2, ...(await request.json()) })
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening/:id', component: ListeningEditPage },
      { path: '/listening', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening/new')
  const page = mount(
    { template: '<RouterView />' },
    {
      attachTo: document.body,
      global: {
        plugins: [router],
        stubs: {
          ListeningContentForm: {
            props: ['modelValue', 'topic'],
            emits: ['update:modelValue', 'update:topic'],
            template: `<div><button class="fill" @click="$emit('update:topic','topic');$emit('update:modelValue',{...modelValue,title_zh:'original'})">fill</button><button class="change" @click="$emit('update:modelValue',{...modelValue,title_zh:'changed'})">change</button></div>`
          },
          ListeningDocxImport: true,
          ListeningTimeline: true,
          ElDialog: true
        }
      }
    }
  )
  await flushPromises()
  await page.get('.fill').trigger('click')
  await page
    .findAll('button')
    .find((b) => b.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  await page.get('.change').trigger('click')
  await page
    .findAll('button')
    .find((b) => b.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  expect(writes.map((r) => r.method)).toEqual(['POST', 'PUT'])
  expect(writes[1]!.url).toContain('/articles/created')
  expect(await writes[0]!.json()).toMatchObject({ payload: { title_zh: 'original' } })
  expect(await writes[1]!.clone().json()).toMatchObject({
    revision: 1,
    payload: { title_zh: 'changed' }
  })
  expect(router.currentRoute.value.path).toBe('/listening')
  page.unmount()
})

const readyPayload = {
  ...emptyPayload(),
  title_zh: '文章',
  title_en: 'An Article',
  body_en: 'We rest.',
  translation_zh: '我们休息。',
  audio_id: 'audio',
  expressions: Array.from({ length: 5 }, () => ({
    english: 'take a break',
    chinese: '休息',
    example: 'Take a break.'
  }))
}
it.each([true, false])(
  'publishes without mandatory preview and returns to the list only on success=%s',
  async (success) => {
    const draft = { ...saved, id: 'existing', payload: readyPayload, word_count: 2 }
    const writes: Request[] = []
    network.mockImplementation(async (request: Request) => {
      if (request.method !== 'GET') writes.push(request.clone())
      if (request.url.endsWith('/categories')) return Response.json({ items: [] })
      if (request.url.endsWith('/topics'))
        return Response.json({ items: [{ id: 'topic', name: '主题', name_en: 'A topic' }] })
      if (request.url.endsWith('/articles/existing')) return Response.json(draft)
      if (request.url.endsWith('/publish'))
        return success
          ? Response.json({ ...draft, status: 'published', revision: 2 })
          : Response.json(
              { error: { code: 'listening_article_changed', message: '编辑稿已变化，请刷新' } },
              { status: 409 }
            )
      throw new Error('Unexpected publication request')
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/listening/:id', component: ListeningEditPage },
        { path: '/listening', component: { template: '<div>文章管理</div>' } }
      ]
    })
    await router.push('/listening/existing?back=%2Flistening%3Fq%3Dmorning')
    const page = mount(
      { template: '<RouterView />' },
      {
        global: {
          plugins: [router],
          stubs: {
            ListeningTimeline: true,
            ListeningDocxImport: true,
            ListeningPreviewPanel: true,
            ElDialog: true
          }
        }
      }
    )
    await flushPromises()
    const publishButton = page.findAll('.save-panel button').find((item) => item.text() === '发布')
    expect(publishButton).toBeDefined()
    await publishButton!.trigger('click')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0]!.url.endsWith('/publish')).toBe(true)
    expect(await writes[0]!.json()).toEqual({ revision: 1 })
    if (success) expect(router.currentRoute.value.fullPath).toBe('/listening?q=morning')
    else {
      expect(router.currentRoute.value.path).toBe('/listening/existing')
      expect(page.text()).toContain('编辑稿已变化，请刷新')
    }
    page.unmount()
  }
)

it('keeps preview optional and retains editable content when returning from it', async () => {
  const draft = { ...saved, id: 'existing', payload: readyPayload, word_count: 2 }
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.method !== 'GET') writes.push(request)
    if (request.url.endsWith('/categories')) return Response.json({ items: [] })
    if (request.url.endsWith('/topics'))
      return Response.json({ items: [{ id: 'topic', name: '主题' }] })
    if (request.url.endsWith('/articles/existing')) return Response.json(draft)
    if (request.url.endsWith('/preview'))
      return Response.json({ article: draft, preview_token: 'checked', errors: [] })
    throw new Error('Unexpected preview request')
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening/:id', component: ListeningEditPage },
      { path: '/listening', component: { template: '<div />' } }
    ]
  })
  await router.push('/listening/existing')
  const page = mount(
    { template: '<RouterView />' },
    {
      global: {
        plugins: [router],
        stubs: {
          ListeningTimeline: true,
          ListeningDocxImport: true,
          ListeningPreviewPanel: true,
          ElDialog: true
        }
      }
    }
  )
  await flushPromises()
  const previewButton = page.findAll('button').find((item) => item.text() === '预览（可选）')
  expect(previewButton).toBeDefined()
  await previewButton!.trigger('click')
  await flushPromises()
  expect(page.get('.preview-workspace').isVisible()).toBe(true)
  await page
    .findAll('button')
    .find((item) => item.text() === '返回修改')!
    .trigger('click')
  expect(page.get('.edit-workspace').isVisible()).toBe(true)
  expect(
    page
      .findAll('.save-panel button')
      .find((item) => item.text() === '发布')!
      .attributes('disabled')
  ).toBeUndefined()
  expect(writes.map((request) => new URL(request.url).pathname)).toEqual([
    '/api/admin/v1/listening/articles/existing/preview'
  ])
  page.unmount()
})

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
  network.mockReset()
})
it('recovers the original creation receipt before saving changed input as an update', async () => {
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
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
  expect(router.currentRoute.value.path).toBe('/listening/created')
  page.unmount()
})

it.each([true, false])(
  'keeps the publication result visible when success is %s',
  async (success) => {
    const draft = { ...saved, id: 'existing', word_count: 120 }
    network.mockImplementation(async (request: Request) => {
      if (request.method === 'GET' && request.url.endsWith('/topics'))
        return Response.json({ items: [{ id: 'topic', name: '主题' }] })
      if (request.method === 'GET' && request.url.endsWith('/articles/existing'))
        return Response.json(draft)
      if (request.url.endsWith('/preview'))
        return Response.json({ article: draft, preview_token: 'confirmed', errors: [] })
      if (request.url.endsWith('/publish'))
        return success
          ? Response.json({ ...draft, status: 'published', revision: 2 })
          : Response.json(
              {
                error: { code: 'listening_preview_stale', message: '编辑稿已变化，请重新预览确认' }
              },
              { status: 409 }
            )
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
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
            ListeningContentForm: true,
            ListeningDocxImport: true,
            ListeningTimeline: true,
            ListeningReader: true,
            ElDialog: {
              props: ['modelValue'],
              template: '<div v-if="modelValue" role="dialog"><slot/><slot name="footer"/></div>'
            }
          }
        }
      }
    )
    await flushPromises()
    await page
      .findAll('button')
      .find((b) => b.text() === '预览并核对发布')!
      .trigger('click')
    await flushPromises()
    await page
      .findAll('button')
      .find((b) => b.text() === '确认发布这一版')!
      .trigger('click')
    await flushPromises()
    if (success) {
      expect(page.find('[role="dialog"]').exists()).toBe(false)
      expect(page.get('.editor-actions').text()).toContain('已发布')
    } else {
      expect(page.get('[role="dialog"]').text()).toContain('编辑稿已变化，请重新预览确认')
    }
    page.unmount()
  }
)

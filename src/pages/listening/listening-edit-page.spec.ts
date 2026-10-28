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

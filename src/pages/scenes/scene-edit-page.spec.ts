import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import SceneEditPage from './scene-edit-page.vue'

it('lets a committed publication return to the list while protecting in-flight writes', async () => {
  const content = {
    name: '在咖啡店点单',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  const card = {
    id: 'card-1',
    draft_revision: 1,
    status: 'draft',
    content,
    issues: [],
    display_name: content.name
  }
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/media/configuration'))
      return Response.json({ image_limit_bytes: 100, audio_limit_bytes: 100 })
    if (request.url.endsWith('/preview'))
      return Response.json({ preview_id: 'preview-1', revision: 1, content, mode: 'draft' })
    if (request.url.endsWith('/publish')) return Response.json({ ...card, status: 'published' })
    return Response.json(card)
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards/card-1', component: SceneEditPage },
      { path: '/cards', component: { template: '<p>管理列表</p>' } }
    ]
  })
  await router.push('/cards/card-1')
  const wrapper = mount(
    { template: '<RouterView />' },
    {
      global: {
        plugins: [router],
        stubs: {
          SceneContentForm: { template: '<div />' },
          ScenePreview: { template: '<button @click="$emit(\'publish\')">确认发布</button>' },
          ElDialog: { template: '<div />' }
        }
      }
    }
  )
  await flushPromises()
  await wrapper.get('button.primary').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '确认发布')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/cards')
  expect(wrapper.text()).toContain('管理列表')
  wrapper.unmount()
})

it('recovers a committed new card with its original key before saving subsequent edits', async () => {
  const writes: {
    method: string
    key: string | null
    body: { content: { name: string }; revision?: number }
  }[] = []
  const receipts = new Map<string | null, object>()
  let created = 0
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/media/configuration'))
      return Response.json({ image_limit_bytes: 100, audio_limit_bytes: 100 })
    const body = await request.json()
    const key = request.headers.get('Idempotency-Key')
    writes.push({ method: request.method, key, body })
    if (receipts.has(key)) return Response.json(receipts.get(key))
    if (request.method === 'POST') created++
    const card = {
      id: `card-${created}`,
      draft_revision: body.revision ? body.revision + 1 : 1,
      content: body.content,
      status: 'draft',
      issues: [],
      display_name: body.content.name
    }
    receipts.set(key, card)
    if (writes.length === 1) throw new TypeError('committed response lost')
    return Response.json(card)
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards/:id', component: SceneEditPage },
      { path: '/cards', component: { template: '<p>卡片列表</p>' } }
    ]
  })
  await router.push('/cards/new')
  const page = mount(
    { template: '<RouterView />' },
    {
      global: {
        plugins: [router],
        stubs: {
          SceneContentForm: {
            props: ['modelValue'],
            template:
              '<input aria-label="场景名称" :value="modelValue.name" @input="$emit(\'update:modelValue\', { ...modelValue, name: $event.target.value })" />'
          },
          SceneDocxImport: { template: '<div />' },
          ElDialog: { template: '<div />' }
        }
      }
    }
  )
  await flushPromises()
  await page.get('input').setValue('初稿名称')
  await page
    .findAll('button')
    .find((x) => x.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  await page.get('input').setValue('修订后的名称')
  await page
    .findAll('button')
    .find((x) => x.text() === '保存草稿')!
    .trigger('click')
  await flushPromises()
  expect(created).toBe(1)
  expect(writes.map((x) => x.method)).toEqual(['POST', 'POST', 'PUT'])
  expect(writes[0]?.key).toBe(writes[1]?.key)
  expect(writes[1]?.body.content.name).toBe('初稿名称')
  expect(writes[2]?.body).toMatchObject({ revision: 1, content: { name: '修订后的名称' } })
  expect(page.get('input').element.value).toBe('修订后的名称')
  expect(router.currentRoute.value.path).toBe('/cards/card-1')
  page.unmount()
})

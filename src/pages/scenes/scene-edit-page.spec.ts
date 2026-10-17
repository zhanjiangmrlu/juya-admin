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

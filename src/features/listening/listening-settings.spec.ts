import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningSettings from './listening-settings.vue'
it('retains the original category key and body when the first response is unknown', async () => {
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.includes('/operations/'))
      return Response.json({ error: { code: 'operation_unknown' } }, { status: 404 })
    if (request.method === 'POST') {
      writes.push(request)
      if (writes.length === 1) throw new Error('lost')
      return Response.json({ id: 'c', name: '分类', revision: 1 })
    }
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: false, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'hierarchy', surface: 'categories' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  ;(page.vm as unknown as { openEdit: (kind: string) => void }).openEdit('category')
  await flushPromises()
  await page.get('form input').setValue('分类')
  await page.get('form').trigger('submit')
  await flushPromises()
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(writes).toHaveLength(2)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
  expect(await writes[0]!.json()).toEqual(await writes[1]!.json())
  page.unmount()
})

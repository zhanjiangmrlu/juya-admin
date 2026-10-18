import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import type { CardView } from './editor-model'

import SceneImagePreview from './scene-image-preview.vue'

it('opens the displayed publication original, zooms it and rejects a stale publication on retry', async () => {
  const card = {
    id: 'one',
    display_name: '卡片',
    status: 'published',
    draft_revision: 2,
    current_version_id: 'v1',
    display_image_id: 'published-image',
    content: { image_id: 'candidate-image' }
  } as CardView
  request.mockResolvedValue(card)
  const page = mount(SceneImagePreview, {
    props: { card },
    global: { stubs: { ElDialog: { template: '<div><slot/></div>' } } }
  })
  await flushPromises()
  expect(page.get('img').attributes('src')).toContain('published-image')
  await page.get('img').trigger('load')
  await page.get('[aria-label="放大场景图"]').trigger('click')
  expect(page.get('img').attributes('style')).toContain('scale(1.25)')
  await page.get('img').trigger('error')
  request.mockResolvedValue({ ...card, current_version_id: 'v2', display_image_id: 'new-image' })
  await page.get('[data-action="retry-image"]').trigger('click')
  await flushPromises()
  expect(page.emitted('invalid')).toBeTruthy()
  page.unmount()
})

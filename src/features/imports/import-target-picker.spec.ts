import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { ApiError } from '@/services/http-client'

import ImportTargetPicker from './import-target-picker.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))

it('offers new-card recovery when a suggested update target was deleted', async () => {
  request.mockRejectedValueOnce(new ApiError('card_deleted', '卡片已删除', 410))
  const page = mount(ImportTargetPicker, {
    props: {
      content: {
        name: '重新上传',
        title_en: 'Upload Again',
        image_id: null,
        audio_id: null,
        dialogue: [],
        vocabulary: [],
        chunks: []
      },
      suggestedId: 'deleted'
    },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  await page
    .findAll('button')
    .find((button) => button.text().includes('核对此资料已有的对应卡片'))!
    .trigger('click')
  await flushPromises()
  expect(page.emitted('unavailable')?.[0]).toEqual(['deleted'])
  expect(page.text()).toContain('卡片已删除')
  await page.get('[data-action="import-as-new"]').trigger('click')
  expect(page.emitted('create')?.length).toBe(1)
  page.unmount()
})

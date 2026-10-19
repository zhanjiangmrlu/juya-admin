import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import type { ImportBatch, ImportItem } from '@/shared/types/import'

import ImportWorkflowPage from './import-workflow-page.vue'

it('keeps ZIPs selected on the first screen queued until upload is explicitly started', async () => {
  const batch: ImportBatch = {
    id: 'new-batch',
    mode: 'zip',
    created_at: '',
    files: [],
    items: [],
    unused_file_ids: []
  }
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path.endsWith('/configuration'))
      return {
        image_limit_bytes: 1000,
        audio_limit_bytes: 1000,
        archive_limit_bytes: 1000,
        import_card_limit: 100
      }
    if (path === '/api/admin/v1/imports' && options?.method === 'POST') return batch
    if (path === '/api/admin/v1/imports') return []
    return batch
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/imports', component: ImportWorkflowPage }]
  })
  await router.push('/imports')
  const page = mount(ImportWorkflowPage, {
    global: { plugins: [router], stubs: { ElDialog: true } }
  })
  await flushPromises()
  const input = page.find('input[aria-label="选择多个ZIP"]')
  expect(input.exists()).toBe(true)
  Object.defineProperty(input.element, 'files', {
    value: [new File(['zip'], 'first.zip'), new File(['zip'], 'second.zip')]
  })
  await input.trigger('change')
  await flushPromises()
  expect(page.text()).toContain('first.zip')
  expect(page.text()).toContain('second.zip')
  expect(page.get('[data-action="start-upload"]').attributes('disabled')).toBeUndefined()
  expect(
    request.mock.calls.filter(
      ([path, options]) => path === '/api/admin/v1/imports' && options?.method === 'POST'
    )
  ).toHaveLength(1)
  expect(request.mock.calls.some(([path]) => path.includes('/files?'))).toBe(false)
  page.unmount()
})

it('restores a batch, persists review changes and only saves actual cards after step-three confirmation', async () => {
  const item: ImportItem = {
    id: 'one',
    revision: 1,
    content: {
      name: 'Original',
      title_en: '',
      image_id: null,
      audio_id: null,
      dialogue: [],
      vocabulary: [],
      chunks: []
    },
    selected: true,
    readable: true,
    state: 'incomplete',
    thumbnail_id: null,
    issues: [{ field: 'image', code: 'missing', message: '缺少图片' }],
    source_file_id: 'source',
    target_card_id: null,
    target_revision: null,
    saved_card_id: null,
    saved_draft_revision: null,
    suggested_target_id: null,
    job_id: null,
    error_code: null
  }
  let current: ImportBatch = {
    id: 'batch',
    mode: 'docx',
    created_at: '2026-10-17T00:00:00Z',
    files: [
      {
        id: 'source',
        name: 'card.docx',
        kind: 'docx',
        state: 'ready',
        size: 100,
        media_id: null,
        job_id: 'parse',
        error_code: null,
        parent_id: ''
      }
    ],
    items: [item],
    unused_file_ids: []
  }
  request.mockImplementation(
    async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === '/api/admin/v1/imports') return [current]
      if (path.endsWith('/configuration'))
        return { image_limit_bytes: 10000, audio_limit_bytes: 10000, archive_limit_bytes: 10000 }
      if (options?.method === 'PATCH') {
        const next = { ...current.items[0]!, ...options.body, revision: 2 }
        current = { ...current, items: [next] }
        return next
      }
      if (path.endsWith('/confirmation'))
        return {
          version: 'a'.repeat(64),
          count: 1,
          incomplete: 1,
          saved: 0,
          duplicates: 0,
          excluded: 0,
          unreadable: 0
        }
      if (path.endsWith('/save')) {
        current = {
          ...current,
          items: [{ ...current.items[0]!, state: 'saved', saved_card_id: 'card-one' }]
        }
        return current
      }
      return current
    }
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/imports', component: ImportWorkflowPage }]
  })
  await router.push('/imports')
  await router.isReady()
  const page = mount(ImportWorkflowPage, {
    global: {
      plugins: [router],
      stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
    }
  })
  await flushPromises()
  expect(page.text()).toContain('继续处理')
  await page.get('[data-action="resume-import"]').trigger('click')
  await flushPromises()
  await page.get('button[aria-expanded="false"]').trigger('click')
  await page.get('input[placeholder="例如：在咖啡店点单"]').setValue('Reviewed')
  await page.get('[data-action="review-next"]').trigger('click')
  await flushPromises()
  expect(current.items[0]?.content.name).toBe('Reviewed')
  expect(page.text()).toContain('将保存1张草稿，其中1张仍待补充')
  expect(request.mock.calls.filter(([path]) => path.endsWith('/save'))).toHaveLength(0)
  await page.get('[data-action="save-import"]').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('成功 1')
  expect(page.get('[data-action="import-cards"]').attributes('href')).toContain('batch_id=batch')
  page.unmount()
})

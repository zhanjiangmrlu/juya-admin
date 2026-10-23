import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/services/http-client'

import type { ImportBatch, ImportItem } from '@/shared/types/import'

import ImportWorkflowPage from './import-workflow-page.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
/** 构造同批卡片在不同保存阶段的服务器结果
 * @param id 本次卡片引用
 * @param state 服务器保存状态
 * @returns 可恢复的单卡导入记录
 */
const item = (id: string, state: string): ImportItem => ({
  id,
  revision: 1,
  state,
  content: {
    name: id,
    title_en: '',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  },
  selected: true,
  readable: true,
  thumbnail_id: null,
  issues: [],
  source_file_id: 'source',
  source_zip_id: 'zip',
  source_zip_name: '来源.zip',
  source_folder: id,
  target_card_id: null,
  target_revision: null,
  saved_card_id: state === 'saved' ? id : null,
  saved_draft_revision: state === 'saved' ? 1 : null,
  suggested_target_id: null,
  job_id: null,
  error_code: null
})

it('retries only the failed IDs and leaves newly added and successful cards outside the save scope', async () => {
  const batch: ImportBatch = {
    id: 'batch',
    mode: 'zip',
    created_at: '',
    updated_at: '',
    resumable: true,
    stage: 'result',
    source_names: ['来源.zip'],
    files: [],
    unused_file_ids: [],
    items: [
      item('failed-one', 'failed'),
      item('saved-one', 'saved'),
      item('new-one', 'incomplete'),
      { ...item('unreadable-failure', 'failed'), readable: false },
      { ...item('excluded-failure', 'failed'), selected: false }
    ]
  }
  request.mockImplementation(async (path: string) => {
    if (path === '/api/admin/v1/imports?resumable_only=true') return [batch]
    if (path.endsWith('/configuration'))
      return {
        archive_limit_bytes: 10000,
        image_limit_bytes: 10000,
        audio_limit_bytes: 10000,
        import_card_limit: 50
      }
    if (path.includes('/confirmation'))
      return {
        version: 'a'.repeat(64),
        count: path.includes('item_ids=failed-one') ? 1 : 2,
        incomplete: 1,
        saved: 1,
        duplicates: 0,
        excluded: 0,
        unreadable: 0
      }
    return batch
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/imports', component: ImportWorkflowPage }]
  })
  await router.push('/imports?batch=batch')
  await router.isReady()
  const page = mount(ImportWorkflowPage, {
    global: {
      plugins: [router],
      stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
    }
  })
  await flushPromises()
  const retry = page.findAll('button').find((button) => button.text().includes('重试失败项'))!
  await retry.trigger('click')
  await flushPromises()
  expect(page.text()).toContain('将保存1张草稿')
  expect(page.findAll('.save-step li')).toHaveLength(1)
  expect(page.get('.save-step').text()).not.toContain('new-one')
  await page.get('[data-action="save-import"]').trigger('click')
  await flushPromises()
  const saved = request.mock.calls.find(([path]) => path.endsWith('/save'))
  expect(saved?.[1].body.item_ids).toEqual(['failed-one'])
  page.unmount()
})

it('removes a duplicate and ignores a stale poll without losing another card correction', async () => {
  let current: ImportBatch = {
    id: 'batch',
    mode: 'zip',
    created_at: '',
    updated_at: '',
    resumable: true,
    stage: 'review',
    source_names: ['来源.zip'],
    files: [],
    unused_file_ids: [],
    items: [item('duplicate', 'duplicate'), item('keep', 'incomplete')]
  }
  let late: ((value: ImportBatch) => void) | undefined
  let delay = false
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/configuration'))
      return {
        archive_limit_bytes: 10000,
        image_limit_bytes: 10000,
        audio_limit_bytes: 10000,
        import_card_limit: 50
      }
    if (path === '/api/admin/v1/imports?resumable_only=true') return [current]
    if (path.endsWith('/items/remove')) {
      current = { ...current, items: [current.items[1]!] }
      return current
    }
    if (path.endsWith('/batch') && delay) {
      delay = false
      return new Promise<ImportBatch>((resolve) => {
        late = resolve
      })
    }
    return current
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/imports', component: ImportWorkflowPage }]
  })
  await router.push('/imports?batch=batch')
  await router.isReady()
  const page = mount(ImportWorkflowPage, {
    global: {
      plugins: [router],
      stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
    }
  })
  await flushPromises()
  await page.get('[data-item-id="keep"] button[aria-controls]').trigger('click')
  await page.get('input[aria-label="中文标题"]').setValue('保留我的修改')
  const stale = structuredClone(current)
  delay = true
  await page.get('[data-action="refresh-import-review"]').trigger('click')
  await page.get('[data-item-id="duplicate"] [data-action="remove-import-item"]').trigger('click')
  await flushPromises()
  await page.get('[data-action="confirm-import-removal"]').trigger('click')
  await flushPromises()
  late?.(stale)
  await flushPromises()
  expect(page.find('[data-item-id="duplicate"]').exists()).toBe(false)
  expect(page.get('input[aria-label="中文标题"]').element).toHaveProperty('value', '保留我的修改')
  expect(page.get('[data-item-id="keep"]').text()).toContain('保留我的修改')
  page.unmount()
})

it.each(['dirty-target', 'conflict'])(
  'allows discarding %s without persisting unwanted edits',
  async (scenario) => {
    let current: ImportBatch = {
      id: 'discard',
      mode: 'zip',
      created_at: '',
      updated_at: '',
      resumable: true,
      stage: 'review',
      source_names: ['来源.zip'],
      files: [],
      unused_file_ids: [],
      items: [
        {
          ...item('discard-me', 'incomplete'),
          target_card_id: scenario === 'dirty-target' ? 'deleted-target' : null,
          target_revision: scenario === 'dirty-target' ? 1 : null
        }
      ]
    }
    let patched = false
    let removedRevision = 0
    request.mockImplementation(
      async (
        path: string,
        options?: { method?: string; body?: { items: { revision: number }[] } }
      ) => {
        if (path.endsWith('/configuration'))
          return {
            archive_limit_bytes: 10000,
            image_limit_bytes: 10000,
            audio_limit_bytes: 10000,
            import_card_limit: 50
          }
        if (path === '/api/admin/v1/imports?resumable_only=true') return [current]
        if (options?.method === 'PATCH') {
          patched = true
          throw new ApiError('import_changed', '另一窗口已修改', 409)
        }
        if (path.endsWith('/items/remove')) {
          removedRevision = options!.body!.items[0]!.revision
          current = { ...current, items: [] }
          return current
        }
        return current
      }
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/imports', component: ImportWorkflowPage }]
    })
    await router.push('/imports?batch=discard')
    await router.isReady()
    const page = mount(ImportWorkflowPage, {
      global: {
        plugins: [router],
        stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } }
      }
    })
    await flushPromises()
    vi.useFakeTimers()
    try {
      await page.get('[data-item-id="discard-me"] button[aria-controls]').trigger('click')
      await page.get('input[aria-label="中文标题"]').setValue('准备放弃的输入')
      if (scenario === 'conflict') await vi.advanceTimersByTimeAsync(650)
      current = { ...current, items: [{ ...current.items[0]!, revision: 2 }] }
      await page.get('[data-action="remove-import-item"]').trigger('click')
      await flushPromises()
      expect(page.find('[data-action="confirm-import-removal"]').exists()).toBe(true)
      await page.get('[data-action="confirm-import-removal"]').trigger('click')
      await flushPromises()
      expect(removedRevision).toBe(2)
      expect(page.find('[data-item-id="discard-me"]').exists()).toBe(false)
      if (scenario === 'dirty-target') expect(patched).toBe(false)
    } finally {
      page.unmount()
      vi.useRealTimers()
    }
  }
)

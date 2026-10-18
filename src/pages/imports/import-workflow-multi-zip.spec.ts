import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

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
    files: [],
    unused_file_ids: [],
    items: [item('failed-one', 'failed'), item('saved-one', 'saved'), item('new-one', 'incomplete')]
  }
  request.mockImplementation(async (path: string) => {
    if (path === '/api/admin/v1/imports') return [batch]
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

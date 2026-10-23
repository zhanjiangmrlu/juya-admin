import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/services/http-client'

import type { ImportBatch, ImportItem } from '@/shared/types/import'

import ImportWorkflowPage from './import-workflow-page.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
type RecoveryBatch = ImportBatch
const candidatesPath = '/api/admin/v1/imports?resumable_only=true'
const pages: ReturnType<typeof mount>[] = []
/** 构造持久核对资料，保留完整导入契约
 * @param state 服务端已确认的逐卡状态
 * @returns 一份可编辑或已保存的资料
 */
const item = (state = 'incomplete'): ImportItem => ({
  id: 'item-one',
  revision: 1,
  state,
  selected: true,
  readable: true,
  content: {
    name: '已暂存中文标题',
    title_en: 'Saved Review',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  },
  thumbnail_id: null,
  issues: [{ field: 'image', code: 'missing', message: '缺少场景图' }],
  source_file_id: 'source',
  source_zip_id: 'source',
  source_zip_name: '晨间.zip',
  source_folder: '晨间',
  target_card_id: null,
  target_revision: null,
  saved_card_id: state === 'saved' ? 'card-one' : null,
  saved_draft_revision: state === 'saved' ? 1 : null,
  suggested_target_id: null,
  job_id: null,
  error_code: null
})
/** 构造包含真实来源与最近变更时间的可恢复集合成员
 * @param id 管理员可明确选择的批次
 * @param stage 服务端推导的恢复阶段
 * @returns 测试批次快照
 */
const batch = (id = 'batch-one', stage: RecoveryBatch['stage'] = 'review'): RecoveryBatch => ({
  id,
  mode: 'zip',
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-22T01:20:00Z',
  resumable: true,
  stage,
  source_names: [`${id}.zip`],
  files: [
    {
      id: 'source',
      name: `${id}.zip`,
      kind: 'zip',
      state: 'ready',
      size: 100,
      media_id: null,
      job_id: null,
      error_code: null,
      parent_id: ''
    }
  ],
  items:
    stage === 'upload' || stage === 'processing'
      ? []
      : [item(stage === 'result' ? 'failed' : 'incomplete')],
  unused_file_ids: []
})
/** 仅替换外部服务，真实挂载路由页面及导入组件
 * @param candidates 当前服务端可恢复集合
 * @param url 初次进入的路由
 * @returns 可操作的页面和路由
 */
const open = async (candidates: RecoveryBatch[] = [], url = '/imports') => {
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/configuration'))
      return {
        image_limit_bytes: 1000,
        audio_limit_bytes: 1000,
        archive_limit_bytes: 1000,
        import_card_limit: 100
      }
    if (path === candidatesPath || path === '/api/admin/v1/imports') return candidates
    const selected = candidates.find(
      (value) => path.split('?')[0] === `/api/admin/v1/imports/${value.id}`
    )
    if (selected) return selected
    throw new Error(`Unexpected request ${path}`)
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/imports', component: ImportWorkflowPage }]
  })
  await router.push(url)
  const page = mount(
    { template: '<RouterView />' },
    {
      global: {
        plugins: [router],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue"><slot/><slot name="footer"/></section>'
          }
        }
      }
    }
  )
  pages.push(page)
  await flushPromises()
  return { page, router }
}
afterEach(() => {
  pages.splice(0).forEach((page) => page.unmount())
  request.mockReset()
})

it('queries only recoverable batches and hides recovery for zero without hiding uploads', async () => {
  const { page } = await open()
  expect(request).toHaveBeenCalledWith(candidatesPath)
  expect(page.find('[data-action="resume-import"]').exists()).toBe(false)
  expect(page.text()).not.toContain('其他最近导入')
  expect(page.find('input[aria-label="选择多个ZIP"]').exists()).toBe(true)
})

it('shows every candidate beyond five with source, updated time, stage and issues without choosing the newest', async () => {
  const values = Array.from({ length: 7 }, (_, index) =>
    batch(
      `batch-${index}`,
      index === 0 ? 'processing' : index === 1 ? 'upload' : index === 2 ? 'result' : 'review'
    )
  )
  values[0]!.files[0]!.state = 'processing'
  const { page, router } = await open(values)
  expect(page.findAll('[data-resume-batch]')).toHaveLength(7)
  expect(page.text()).toContain('batch-6.zip')
  expect(page.text()).toContain('2026-10-22 09:20')
  expect(page.text()).not.toContain('2026-10-20 08:00')
  expect(page.text()).toContain('正在读取资料')
  expect(page.text()).toContain('上传资料')
  expect(page.text()).toContain('保存结果')
  expect(page.text()).toContain('核对卡片')
  expect(page.text()).toContain('缺少场景图')
  expect(page.text()).not.toContain('其他最近导入')
  expect(router.currentRoute.value.query.batch).toBeUndefined()
  expect(request.mock.calls.some(([path]) => /\/imports\/batch-/.test(path))).toBe(false)
})

it('requires explicit selection and revalidates the sole batch before restoring saved review inputs', async () => {
  const { page, router } = await open([batch()])
  expect(router.currentRoute.value.query.batch).toBeUndefined()
  expect(page.text()).toContain('batch-one.zip')
  await page.get('[data-action="resume-import"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/admin/v1/imports/batch-one?require_resumable=true')
  expect(router.currentRoute.value.query.batch).toBe('batch-one')
  expect(page.text()).toContain('已暂存中文标题')
  expect(page.get('.import-steps .active').text()).toContain('核对卡片')
})

it('keeps upload available and distinguishes a failed candidate query from an empty collection', async () => {
  const { page } = await open()
  request.mockRejectedValueOnce(new ApiError('network_unknown', '网络连接中断'))
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(page.get('[role="alert"]').text()).toContain('查询失败')
  expect(page.find('input[aria-label="选择多个ZIP"]').exists()).toBe(true)
  expect(page.find('[data-action="refresh-resumable"]').exists()).toBe(true)
  request.mockResolvedValueOnce([batch()])
  await page.get('[data-action="refresh-resumable"]').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('batch-one.zip')
})

it('retains the chosen candidate on network failure so the same selection can be retried', async () => {
  const { page, router } = await open([batch()])
  request.mockRejectedValueOnce(new ApiError('network_unknown', '网络连接中断'))
  await page.get('[data-action="resume-import"]').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('网络连接中断')
  expect(page.text()).toContain('batch-one.zip')
  expect(router.currentRoute.value.query.batch).toBeUndefined()
  await page.get('[data-action="resume-import"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query.batch).toBe('batch-one')
})

it.each([409, 403, 404])(
  'explains an invalid selection (%s) and refreshes the collection without opening it',
  async (status) => {
    const { page, router } = await open([batch('stale'), batch('available')])
    request.mockRejectedValueOnce(new ApiError('import_not_resumable', '批次已不可恢复', status))
    request.mockResolvedValueOnce([batch('available')])
    await page.get('[data-resume-batch="stale"] [data-action="resume-import"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('不可恢复')
    expect(page.find('[data-resume-batch="stale"]').exists()).toBe(false)
    expect(page.text()).toContain('available.zip')
    expect(router.currentRoute.value.query.batch).toBeUndefined()
    expect(request.mock.calls.filter(([path]) => path === candidatesPath)).toHaveLength(2)
  }
)

it('does not replace the current review with a late background collection refresh', async () => {
  const { page, router } = await open([batch()])
  let finish: (values: RecoveryBatch[]) => void = () => {}
  request.mockImplementationOnce(
    () =>
      new Promise<RecoveryBatch[]>((resolve) => {
        finish = resolve
      })
  )
  window.dispatchEvent(new Event('focus'))
  await page.get('[data-action="resume-import"]').trigger('click')
  await flushPromises()
  finish([batch('different', 'result')])
  await flushPromises()
  expect(router.currentRoute.value.query.batch).toBe('batch-one')
  expect(page.text()).toContain('已暂存中文标题')
  expect(page.get('.import-steps .active').text()).toContain('核对卡片')
})

it('opens a completed current result without the resume guard and preserves its card destinations', async () => {
  const completed = { ...batch('completed', 'result'), resumable: false, items: [item('saved')] }
  const { page } = await open([completed], '/imports?batch=completed')
  expect(request).toHaveBeenCalledWith('/api/admin/v1/imports/completed')
  expect(request).not.toHaveBeenCalledWith('/api/admin/v1/imports/completed?require_resumable=true')
  expect(page.text()).toContain('成功 1')
  expect(page.get('[data-action="import-cards"]').attributes('href')).toContain(
    'batch_id=completed'
  )
  expect(page.text()).toContain('补充资料')
})

it.each(['upload', 'processing', 'result'] as const)(
  'restores the server %s phase instead of inferring review from items',
  async (stage) => {
    const current = batch('phase', stage)
    if (stage === 'upload' || stage === 'processing') current.items = [item()]
    const { page } = await open([current])
    await page.get('[data-action="resume-import"]').trigger('click')
    await flushPromises()
    expect(page.get('.import-steps .active').text()).toContain(
      stage === 'result' ? '保存草稿' : '上传资料'
    )
    if (stage === 'upload') expect(page.text()).toContain('重新选择')
  }
)

it.each([1, 3])(
  'confirms deletion from each of %s candidates and keeps saved cards untouched',
  async (count) => {
    const values = Array.from({ length: count }, (_, index) => batch(`delete-${index}`))
    values[0]!.items.push(item('saved'))
    const { page, router } = await open(values)
    await page
      .get('[data-resume-batch="delete-0"] [data-action="delete-import-batch"]')
      .trigger('click')
    await flushPromises()
    expect(page.text()).toContain('已保存的卡片、素材和用户成绩会保留')
    expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    await page.get('[data-action="cancel-batch-deletion"]').trigger('click')
    expect(page.findAll('[data-action="delete-import-batch"]')).toHaveLength(count)
    await page
      .get('[data-resume-batch="delete-0"] [data-action="delete-import-batch"]')
      .trigger('click')
    request.mockResolvedValueOnce({ id: 'delete-0', deleted: true })
    await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/api/admin/v1/imports/delete-0', {
      method: 'DELETE',
      body: { expected_updated_at: '2026-10-22T01:20:00Z' },
      key: expect.any(String)
    })
    expect(page.find('[data-resume-batch="delete-0"]').exists()).toBe(false)
    expect(page.findAll('[data-action="delete-import-batch"]')).toHaveLength(count - 1)
    expect(router.currentRoute.value.query.batch).toBeUndefined()
    expect(request.mock.calls.some(([path]) => path.startsWith('/api/admin/v1/cards'))).toBe(false)
  }
)

it('cannot recreate a deleted candidate through an older in-flight collection response', async () => {
  const { page } = await open([batch()])
  let finish: (values: RecoveryBatch[]) => void = () => {}
  request.mockImplementationOnce(
    () =>
      new Promise<RecoveryBatch[]>((resolve) => {
        finish = resolve
      })
  )
  window.dispatchEvent(new Event('focus'))
  await page.get('[data-action="delete-import-batch"]').trigger('click')
  request.mockResolvedValueOnce({ id: 'batch-one', deleted: true })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  finish([batch()])
  await flushPromises()
  expect(page.find('[data-resume-batch="batch-one"]').exists()).toBe(false)
})

it.each([
  ['import_changed', '批次资料已变化，请刷新后重新确认删除'],
  ['import_saving', '批次正在保存卡片，请等待保存完成后再删除']
])('refreshes a conflicting deletion (%s) without opening another batch', async (code, message) => {
  const { page, router } = await open([batch()])
  await page.get('[data-action="delete-import-batch"]').trigger('click')
  request.mockRejectedValueOnce(new ApiError(code, message, 409))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(page.text()).toContain(message)
  expect(page.find('[data-action="resume-import"]').attributes('disabled')).toBeDefined()
  request.mockResolvedValueOnce([{ ...batch(), updated_at: '2026-10-23T00:00:00Z' }])
  await page.get('[data-action="refresh-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query.batch).toBeUndefined()
  await page.get('[data-action="delete-import-batch"]').trigger('click')
  request.mockResolvedValueOnce({ id: 'batch-one', deleted: true })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(
    request.mock.calls.filter(([, options]) => options?.method === 'DELETE').at(-1)?.[1].body
  ).toEqual({ expected_updated_at: '2026-10-23T00:00:00Z' })
})

it('keeps unknown deletion isolated from creating, resuming and leaving until its receipt is known', async () => {
  const { page, router } = await open([batch('delete-me'), batch('keep-me')])
  router.addRoute({ path: '/cards', component: { template: '<div>卡片库</div>' } })
  await page
    .get('[data-resume-batch="delete-me"] [data-action="delete-import-batch"]')
    .trigger('click')
  request.mockRejectedValueOnce(new ApiError('network_unknown', '删除回执未知'))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  const calls = request.mock.calls.length
  await page.get('[data-resume-batch="keep-me"] [data-action="resume-import"]').trigger('click')
  await page.get('.docx-entry').trigger('click')
  await router.push('/cards')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/imports')
  expect(request.mock.calls).toHaveLength(calls)
  const leaving = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(leaving)
  expect(leaving.defaultPrevented).toBe(true)
  request.mockResolvedValueOnce({
    key: request.mock.calls.at(-1)?.[1]?.key,
    result: { id: 'delete-me', deleted: true }
  })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(page.find('[data-resume-batch="keep-me"]').exists()).toBe(true)
  expect(page.find('[data-resume-batch="delete-me"]').exists()).toBe(false)
  await router.push('/cards')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/cards')
})

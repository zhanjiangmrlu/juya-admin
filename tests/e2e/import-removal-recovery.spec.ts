import { expect, test } from '@playwright/test'

import type { ImportBatch, ImportFile, ImportItem } from '../../src/shared/types/import'
import type { Page } from '@playwright/test'

/** 构造恢复列表和当前批次共用的已接收ZIP
 * @param id 独立来源包编号
 * @returns 已完成解析的来源包
 */
const source = (id: string): ImportFile => ({
  id,
  name: `${id}.zip`,
  kind: 'zip',
  state: 'ready',
  size: 100,
  media_id: null,
  job_id: null,
  error_code: null,
  parent_id: ''
})

/** 构造未写入正式卡片库的独立核对资料
 * @param id 本次资料编号及标题
 * @param zipId 该资料实际所属来源包
 * @returns 可从当前导入移除的资料
 */
const item = (id: string, zipId: string): ImportItem => ({
  id,
  revision: 1,
  state: 'incomplete',
  content: {
    name: id,
    title_en: `Card ${id}`,
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
  source_file_id: `docx-${id}`,
  source_zip_id: zipId,
  source_zip_name: `${zipId}.zip`,
  source_folder: id,
  target_card_id: null,
  target_revision: null,
  saved_card_id: null,
  saved_draft_revision: null,
  suggested_target_id: null,
  job_id: null,
  error_code: null
})

/** 为浏览器提供服务端阶段明确的可恢复批次
 * @param stage 本轮验证的服务端实际恢复阶段
 * @param files 来源包
 * @param items 各包识别出的独立卡片
 * @returns 完整恢复契约样本
 */
const batch = (
  stage: ImportBatch['stage'],
  files: ImportFile[],
  items: ImportItem[]
): ImportBatch => ({
  id: 'merge-regression',
  mode: 'zip',
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-22T01:20:00Z',
  resumable: true,
  stage,
  source_names: files.map((file) => file.name),
  files,
  items,
  unused_file_ids: []
})

/** 在边界拦截全部API，既不登录真实账号也不向共享服务写入
 * @param page 当前受控浏览器页面
 * @param initial 服务端最初保留的批次
 * @returns 观察移除请求、保留批次及控制迟到读取的端口
 */
const isolate = async (page: Page, initial: ImportBatch) => {
  let current = initial
  const removals: { path: string; body: unknown }[] = []
  const unexpected: string[] = []
  let checked = false
  let delay = false
  let release: (() => Promise<void>) | undefined
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/auth/session'))
      return route.fulfill({ json: { id: 'synthetic', username: 'synthetic', csrf_token: 'test' } })
    if (url.pathname.endsWith('/feedback/unread'))
      return route.fulfill({ json: { unread: false, count: 0 } })
    if (url.pathname.endsWith('/configuration'))
      return route.fulfill({
        json: {
          archive_limit_bytes: 10000000,
          image_limit_bytes: 1000000,
          audio_limit_bytes: 1000000,
          import_card_limit: 100
        }
      })
    if (url.pathname === '/api/admin/v1/imports') {
      expect(url.searchParams.get('resumable_only')).toBe('true')
      return route.fulfill({ json: [current] })
    }
    if (url.pathname.endsWith('/files/remove')) {
      const body = request.postDataJSON() as { file_ids: string[] }
      removals.push({ path: url.pathname, body })
      current = {
        ...current,
        files: current.files.filter((file) => !body.file_ids.includes(file.id)),
        items: current.items.filter((value) => !body.file_ids.includes(value.source_zip_id || ''))
      }
      return route.fulfill({ json: current })
    }
    if (url.pathname.endsWith('/items/remove')) {
      const body = request.postDataJSON() as { items: { id: string; revision: number }[] }
      removals.push({ path: url.pathname, body })
      current = {
        ...current,
        items: current.items.filter((value) => !body.items.some((row) => row.id === value.id))
      }
      return route.fulfill({ json: current })
    }
    if (url.pathname === '/api/admin/v1/imports/merge-regression') {
      if (url.searchParams.get('require_resumable') === 'true') checked = true
      if (delay) {
        delay = false
        const stale = structuredClone(current)
        await new Promise<void>((resolve) => {
          release = async () => {
            await route.fulfill({ json: stale })
            resolve()
          }
        })
        return
      }
      return route.fulfill({ json: current })
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({
      status: 404,
      json: { error: { code: 'not_found', message: '合成测试不支持此请求' } }
    })
  })
  return {
    removals,
    unexpected,
    checked: () => checked,
    hold: () => {
      delay = true
    },
    release: async () => {
      expect(release).toBeDefined()
      await release!()
    }
  }
}

test('restored multi-ZIP upload removes one and a bulk selection without changing the retained ZIP', async ({
  page
}) => {
  const values = ['one', 'two', 'three', 'keep']
  const ports = await isolate(
    page,
    batch(
      'upload',
      values.map(source),
      values.map((id) => item(id, id))
    )
  )
  await page.goto('/imports')
  await page.locator('[data-action="resume-import"]').click()
  await expect(page.locator('.import-steps .active')).toContainText('上传资料')
  await expect(page.locator('.file-list li')).toHaveCount(4)
  expect(ports.checked()).toBe(true)
  await page
    .locator('.file-list li')
    .filter({ hasText: 'one.zip' })
    .locator('[data-action="remove-accepted-upload"]')
    .click()
  await expect(page.getByRole('dialog')).toContainText('one.zip')
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.file-list li')).toHaveCount(3)
  await page.getByLabel('移除ZIP two.zip', { exact: true }).check()
  await page.getByLabel('移除ZIP three.zip', { exact: true }).check()
  await page.locator('[data-action="remove-selected-files"]').click()
  await expect(page.getByRole('dialog')).toContainText('two.zip')
  await expect(page.getByRole('dialog')).toContainText('three.zip')
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.file-list li')).toHaveCount(1)
  await expect(page.locator('.file-list')).toContainText('keep.zip')
  expect(ports.removals.map((value) => value.body)).toEqual([
    { file_ids: ['one'] },
    { file_ids: ['two', 'three'] }
  ])
  await page.reload()
  await expect(page.locator('.file-list li')).toHaveCount(1)
  await expect(page.locator('.file-list')).toContainText('keep.zip')
  expect(ports.unexpected).toEqual([])
})

test('restored review retains its source ZIP and sibling when an old read arrives after single and bulk removal', async ({
  page
}) => {
  const ports = await isolate(
    page,
    batch(
      'review',
      [source('folders')],
      ['one', 'two', 'keep'].map((id) => item(id, 'folders'))
    )
  )
  await page.goto('/imports')
  await page.locator('[data-action="resume-import"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(3)
  expect(ports.checked()).toBe(true)
  ports.hold()
  await page.locator('[data-action="refresh-import-review"]').click()
  await page.locator('[data-item-id="one"] [data-action="remove-import-item"]').click()
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(2)
  await ports.release()
  await expect(page.locator('[data-item-id="one"]')).toHaveCount(0)
  await page.locator('[data-action="manage-removals"]').click()
  await page.getByLabel('移除 two', { exact: true }).check()
  await page.locator('[data-action="remove-selected-items"]').click()
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(1)
  await expect(page.locator('[data-item-id="keep"]')).toContainText('folders.zip')
  expect(ports.removals.map((value) => value.body)).toEqual([
    { items: [{ id: 'one', revision: 1 }] },
    { items: [{ id: 'two', revision: 1 }] }
  ])
  await page.getByRole('button', { name: '返回补充文件', exact: true }).click()
  await expect(page.locator('.file-list li')).toHaveCount(1)
  await expect(page.locator('.file-list')).toContainText('folders.zip')
  expect(ports.unexpected).toEqual([])
})

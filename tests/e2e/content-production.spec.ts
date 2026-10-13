import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder, order, scene } from './fixtures/content-work-orders'

test('修改正文后进入场景音频前保存当前工作单候选', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, { template: 'dialogue', content: scene })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await page.getByLabel('英文标题', { exact: true }).fill('Local metadata survives cutting')
  await page.getByLabel('英文句子 1', { exact: true }).fill('Keep this current sentence.')
  await page.getByRole('button', { name: '整段音频、句子边界与切片', exact: true }).click()
  await expect(page).toHaveURL(/SCENE-1\/edit\?stage=audio&work_order_id=order&work_item_id=one/)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    current: {
      content: {
        title_en: 'Local metadata survives cutting',
        dialogue: [{ id: 'SENTENCE-1', english: 'Keep this current sentence.' }]
      }
    }
  })
})

test('未知命令只续办原服务端回执，不重复发起抽样批准', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page)
  let uncertain = false
  let writes = 0
  await page.route('**/work-orders/order', (route) =>
    route.fulfill({
      json: {
        ...order,
        pending_commands: uncertain
          ? [{ command_id: 'pending', action: 'organize', retry_at: '2026-01-01T00:00:00Z' }]
          : []
      }
    })
  )
  await page.route('**/work-orders/order/organize', async (route) => {
    writes++
    uncertain = true
    await route.fulfill({ status: 503, json: { code: 'UNKNOWN', message: '结果待核实' } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order')
  await page.getByRole('button', { name: '自动整理本批', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续核实结果', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续核实结果', exact: true }).click()
  await expect
    .poll(() => requests.some((row) => row.path.endsWith('/commands/pending/resume')))
    .toBe(true)
  expect(writes).toBe(1)
})

test('修正冲突保留输入并重新加载身份绑定，不自动重试旧修改', async ({ adminApi, page }) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  const requests = await mockWorkOrder(page)
  let writes = 0
  await page.route('**/work-orders/order/items/one/correction', async (route) => {
    writes++
    await route.fulfill({
      status: 409,
      json: { code: 'WORK_VERSION_CONFLICT', message: '内容已被更新' }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await page.getByText('编辑正文与译文', { exact: true }).click()
  await page.getByLabel('全文中文翻译', { exact: true }).fill('冲突时保留的本地译文')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect(page.getByText(/输入已保留，请与刷新后的候选核对后重新编辑/)).toBeVisible()
  await expect(page.getByLabel('全文中文翻译', { exact: true })).toHaveValue('冲突时保留的本地译文')
  await expect(page.getByRole('button', { name: '保存候选修正', exact: true })).toBeDisabled()
  expect(writes).toBe(1)
  expect(
    requests.filter((request) => request.path.endsWith('/entry-bindings')).length
  ).toBeGreaterThan(1)
})

test('工作单场景音频使用原有真实保存接口并返回同一批次', async ({ adminApi, page }) => {
  await page.route('**/api/v1/admin/media/audio-targets/TARGET-1/versions', (route) =>
    route.fulfill({
      json: {
        items: [1, 2].map((number) => ({
          id: `VERSION-${number}`,
          asset_id: 'ASSET-AUDIO-1',
          target_id: 'TARGET-1',
          version_no: number,
          source: 'MANUAL',
          status: 'ACTIVE',
          created_at: '2026-09-30T10:00:00Z',
          created_by: 'ADMIN-1',
          processing_job_id: null,
          provider_request_id: null
        }))
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/scenes/SCENE-1/edit?stage=audio&work_order_id=order&work_item_id=one'
  )
  await page.getByText('上传 / 替换与选择音频版本', { exact: true }).click()
  await page.getByRole('button', { name: '加载音频版本', exact: true }).click()
  await page.getByRole('combobox', { name: '整段音频版本', exact: true }).press('Enter')
  await page.getByRole('option', { name: '第 2 次上传 · 可使用', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '切换内容工作区' })).toHaveCount(0)
  await page.getByRole('button', { name: '返回本批校对', exact: true }).click()
  await expect(page).toHaveURL(/content\/work-orders\/order$/)
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({ content: { audio: { version_id: 'VERSION-2' } } })
})

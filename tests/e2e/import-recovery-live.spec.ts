import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type { ImportBatch } from '../../src/shared/types/import'

const stateFile = process.env.JUYA_IMPORT_RECOVERY_STATE || ''
const expectedCount = Number(process.env.JUYA_IMPORT_RECOVERY_EXPECT || 0)
const state = stateFile ? JSON.parse(readFileSync(stateFile, 'utf8')) : null
test.skip(!state, 'Requires an explicitly supplied isolated synthetic API state file')

test('isolated HTTP API restores the actual candidate collection and persisted review', async ({
  page
}) => {
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(state.username)
  await page.getByLabel('密码', { exact: true }).fill(state.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  const response = await page.request.get('/api/admin/v1/imports?resumable_only=true')
  expect(response.ok()).toBe(true)
  const values: ImportBatch[] = await response.json()
  expect(values).toHaveLength(expectedCount)
  await page.goto('/imports')
  await expect(page.getByRole('heading', { name: '上传资料', exact: true })).toBeVisible()
  await expect(page.locator('[data-resume-batch]')).toHaveCount(expectedCount)
  await expect(page.getByText('其他最近导入')).toHaveCount(0)
  await page.screenshot({
    path: `test-results/revision15-import-http-${expectedCount}.png`,
    fullPage: true,
    animations: 'disabled'
  })
  if (!values.length) {
    await expect(page.getByRole('button', { name: '继续处理', exact: true })).toHaveCount(0)
    return
  }
  const selected = values.find((value) => value.stage === 'review') || values[0]!
  const row = page.locator(`[data-resume-batch="${selected.id}"]`)
  for (const name of selected.source_names) await expect(row).toContainText(name)
  const guarded = page.waitForRequest((request) =>
    request.url().includes(`/imports/${selected.id}?require_resumable=true`)
  )
  await row.getByRole('button', { name: '继续处理', exact: true }).click()
  await guarded
  await expect(page).toHaveURL(new RegExp(`batch=${selected.id}`))
  if (selected.stage === 'review') {
    const title = `${selected.items[0]!.content.name}已核对`
    await page.locator('button[aria-expanded="false"]').first().click()
    await page.getByPlaceholder('例如：在咖啡店点单', { exact: true }).fill(title)
    await expect(page.getByText('核对改动已暂存，可离开后恢复', { exact: false })).toBeVisible()
    await page.reload()
    await expect(page.locator('.review-list')).toContainText(title)
    const persisted: ImportBatch = await (
      await page.request.get(`/api/admin/v1/imports/${selected.id}`)
    ).json()
    expect(persisted.items[0]!.content.name).toBe(title)
  } else {
    await expect(page.getByRole('heading', { name: '保存结果', exact: true })).toBeVisible()
    await expect(page.locator('[data-action="import-cards"]')).toHaveAttribute(
      'href',
      `/cards?batch_id=${selected.id}`
    )
    await page.reload()
    await expect(page.getByRole('heading', { name: '保存结果', exact: true })).toBeVisible()
  }
})

test('isolated HTTP mixed-result retry keeps the successful draft and only queues applicable failures', async ({
  page
}) => {
  test.skip(expectedCount < 7, 'Mixed retry runs after the seven-candidate verification')
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(state.username)
  await page.getByLabel('密码', { exact: true }).fill(state.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  const values: ImportBatch[] = await (
    await page.request.get('/api/admin/v1/imports?resumable_only=true')
  ).json()
  const mixed = values.find(
    (value) => value.stage === 'result' && value.items.some((item) => item.state === 'failed')
  )!
  expect(mixed).toBeTruthy()
  const saved = mixed.items.find((item) => item.state === 'saved')!
  const failedIds = mixed.items
    .filter((item) => item.state === 'failed' && item.readable && item.selected)
    .map((item) => item.id)
  expect(failedIds.length).toBeGreaterThan(0)
  await page.goto('/imports')
  await page
    .locator(`[data-resume-batch="${mixed.id}"]`)
    .getByRole('button', { name: '继续处理', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '保存结果', exact: true })).toBeVisible()
  const confirmationRequest = page.waitForRequest((request) =>
    request.url().includes(`/imports/${mixed.id}/confirmation?`)
  )
  await page.getByRole('button', { name: '重试失败项，重新确认', exact: true }).click()
  const confirmation = await confirmationRequest
  expect(new URL(confirmation.url()).searchParams.getAll('item_ids')).toEqual(failedIds)
  await expect(page.locator('.save-step li')).toHaveCount(failedIds.length)
  const accepted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/imports/${mixed.id}/save`) && response.request().method() === 'POST'
  )
  await page.locator('[data-action="save-import"]').click()
  const result = await accepted
  expect(result.ok()).toBe(true)
  expect(result.request().postDataJSON().item_ids).toEqual(failedIds)
  const current: ImportBatch = await result.json()
  expect(current.items.find((item) => item.id === saved.id)).toMatchObject({
    state: 'saved',
    saved_card_id: saved.saved_card_id,
    saved_draft_revision: saved.saved_draft_revision
  })
  for (const id of failedIds)
    expect(current.items.find((item) => item.id === id)?.state).toBe('saving')
  await page.reload()
  await expect(page.locator('[data-action="import-cards"]')).toHaveAttribute(
    'href',
    `/cards?batch_id=${mixed.id}`
  )
  await page.screenshot({
    path: 'test-results/revision15-import-http-retry.png',
    fullPage: true,
    animations: 'disabled'
  })
})

import type { Page } from '@playwright/test'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order, scene } from './fixtures/content-work-orders'

/**
 * 装配原回执续办后的真实分区变化，无新增业务命令
 * @param page - 独立浏览器页面
 * @param delayed - 是否暂停原回执响应以测试换地址
 * @param failed - 原回执是否仍明确未能核实
 * @returns 读取记录、续办记录及解除暂停
 */
const receiptFixture = async (page: Page, delayed = false, failed = false) => {
  await mockWorkOrder(page, { template: 'dialogue', content: scene })
  let resumed = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reads: string[] = []
  const writes: { path: string; body: string | null }[] = []
  await page.route('**/api/v1/admin/content-production/work-orders/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const id = path.includes('/other') ? 'other' : 'order'
    const done = id === 'other' || resumed
    if (request.method() !== 'GET') {
      writes.push({ path, body: request.postData() })
      if (!path.endsWith('/commands/original-receipt/resume')) {
        await route.fulfill({
          status: 409,
          json: { code: 'UNEXPECTED_WRITE', message: '禁止新增命令' }
        })
        return
      }
      if (delayed) await gate
      if (failed) {
        await route.fulfill({ status: 503, json: { code: 'UNKNOWN', message: '原回执仍待核实' } })
        return
      }
      resumed = true
      await route.fulfill({
        json: {
          work_order_id: id,
          command_id: 'original-receipt',
          action: 'organize',
          status: 'SUCCEEDED',
          version: 2
        }
      })
      return
    }
    reads.push(path)
    const counts = { ...order.counts, total: 1, normal: 0, review_required: 1, failed: 0 }
    const member = {
      ...item,
      work_order_id: id,
      title_en: id === 'other' ? 'Other batch' : 'Same batch',
      tasks: [],
      issues: [
        {
          id: 'current-issue',
          message: id === 'other' ? '另一批问题' : done ? '续办后的新问题' : '续办前的旧问题',
          location: ['translation_zh'],
          correction_target: 'content'
        }
      ]
    }
    if (path.endsWith('/items')) {
      await route.fulfill({
        json: {
          items: [member],
          total: 1,
          page: 1,
          page_size: 100,
          counts,
          version: done ? 2 : 1,
          collection_hash: `${id}-${done}`
        }
      })
    } else if (path.endsWith('/phases')) {
      await route.fulfill({
        json: {
          work_order_id: id,
          version: done ? 2 : 1,
          counts,
          phases: [
            {
              key: 'matching',
              label: '素材与词库匹配',
              counts: { total: 1, unknown: done ? 0 : 1, succeeded: done ? 1 : 0 },
              retryable: []
            }
          ]
        }
      })
    } else if (path.endsWith('/usage')) {
      await route.fulfill({
        json: {
          work_order_id: id,
          attempts: [],
          planned: [],
          potential: [],
          retry_count: 0,
          unknown_count: 0,
          source_text_count: 1,
          source_unknown_count: 0,
          source_text_utf8_bytes: done ? 222 : 111,
          measured_audio_ms: null,
          audio_unknown_count: 0,
          known_list_price_subtotal_cny: null,
          unpriced_attempt_count: 0
        }
      })
    } else if (path.endsWith('/import-preview')) {
      await route.fulfill({
        json: {
          work_order_id: id,
          batch_id: `batch-${id}`,
          status: done ? 'CONFIRMED' : 'PREVIEW_READY',
          preview_hash: `${done ? 'b' : 'a'}`.repeat(64),
          preview_version: done ? 2 : 1,
          batch_issues: [],
          items: [
            {
              item_id: 'one',
              import_item_id: 'import-one',
              import_content_id: 'scene-one',
              row_no: 5,
              status: done ? 'SUCCESS' : 'PENDING',
              operation: done ? 'SKIP' : 'CREATE',
              candidate: scene,
              issues: [],
              defaults: [],
              resources: {},
              entries: [],
              source_snapshot: null,
              result: done
                ? {
                    item_id: 'import-one',
                    status: 'SUCCESS',
                    operation: 'CREATE',
                    revision_id: 'revision'
                  }
                : null
            }
          ]
        }
      })
    } else {
      await route.fulfill({
        json: {
          ...order,
          work_order_id: id,
          content_type: 'dialogue',
          counts,
          version: done ? 2 : 1,
          pending_commands: done
            ? []
            : [
                {
                  command_id: 'original-receipt',
                  action: 'organize',
                  retry_at: '2026-01-01T00:00:00Z'
                }
              ]
        }
      })
    }
  })
  return { reads, writes, release: () => release() }
}

for (const view of ['overview', 'jobs', 'import']) {
  test(`原回执续办后${view}分区实读更新，无需手动刷新`, async ({ page, adminApi }) => {
    expect(adminApi).toBeDefined()
    const fixture = await receiptFixture(page)
    await loginAsAdmin(page)
    await navigateInApp(page, `/content/work-orders/order?view=${view}&import_phase=result`)
    if (view === 'overview')
      await expect(page.getByText('续办前的旧问题', { exact: true })).toBeVisible()
    if (view === 'jobs') await expect(page.getByText('1 篇尚待核实', { exact: true })).toBeVisible()
    if (view === 'import')
      await expect(page.getByText('导入结果待核实，尚未发布', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '继续核实结果', exact: true }).click()
    if (view === 'overview') {
      await expect(page.getByText('续办后的新问题', { exact: true })).toBeVisible()
      await expect(page.getByText('续办前的旧问题', { exact: true })).toHaveCount(0)
    }
    if (view === 'jobs') {
      await expect(page.getByText('1 篇已完成', { exact: true })).toBeVisible()
      await expect(page.getByText(/已读正文 222 UTF-8 字节/)).toBeVisible()
    }
    if (view === 'import')
      await expect(page.getByText('新增草稿已保存', { exact: true })).toBeVisible()
    expect(fixture.writes).toEqual([
      {
        path: '/api/v1/admin/content-production/work-orders/order/commands/original-receipt/resume',
        body: null
      }
    ])
  })
}

test('续办仍未明确时保留原错误和回执，不创建收费重试', async ({ page, adminApi }) => {
  expect(adminApi).toBeDefined()
  const fixture = await receiptFixture(page, false, true)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=jobs')
  await page.getByRole('button', { name: '继续核实结果', exact: true }).click()
  await expect(page.getByText('服务暂时不可用，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('1 篇尚待核实', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续核实结果', exact: true })).toBeEnabled()
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.writes[0].path).toMatch(/commands\/original-receipt\/resume$/)
})

for (const destination of ['order?view=overview', 'other?view=jobs']) {
  test(`续办期间切换到${destination}，迟到回执不重读或覆盖新地址`, async ({ page, adminApi }) => {
    expect(adminApi).toBeDefined()
    const fixture = await receiptFixture(page, true)
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order?view=jobs')
    await page.getByRole('button', { name: '继续核实结果', exact: true }).click()
    await expect.poll(() => fixture.writes.length).toBe(1)
    await navigateInApp(page, `/content/work-orders/${destination}`)
    if (destination.startsWith('other'))
      await expect(page.getByText('1 篇已完成', { exact: true })).toBeVisible()
    else await expect(page.getByText('续办前的旧问题', { exact: true })).toBeVisible()
    const readCount = fixture.reads.length
    const completion = page.waitForResponse((response) =>
      response.url().endsWith('/commands/original-receipt/resume')
    )
    fixture.release()
    await completion
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(fixture.reads).toHaveLength(readCount)
    await expect(page).toHaveURL(new RegExp(destination.replace('?', '\\?')))
    if (destination.startsWith('other'))
      await expect(page.getByText(/已读正文 222 UTF-8 字节/)).toBeVisible()
    else await expect(page.getByText('续办前的旧问题', { exact: true })).toBeVisible()
    expect(fixture.writes).toHaveLength(1)
  })
}

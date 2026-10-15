import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder } from './fixtures/content-work-orders'

const originalBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x41, 0x42])
const views = [
  '/content/work-orders/order?view=overview',
  '/content/work-orders/order/items/one?section=source'
]

for (const path of views) {
  test(`重复查看原文件取消旧下载时不显示失败 ${path}`, async ({ adminApi, page }) => {
    const writes = await mockWorkOrder(page)
    let attempts = 0
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    await page.route('**/work-orders/order/original-file', async (route) => {
      attempts++
      if (attempts === 1) {
        await firstPending
        await route.abort('aborted')
        return
      }
      await route.fulfill({ body: originalBytes, contentType: 'application/octet-stream' })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, path)
    const original = page.getByRole('button', { name: '查看原文件', exact: true })
    const firstRequest = page.waitForRequest('**/work-orders/order/original-file')
    await original.click()
    await firstRequest
    const cancelled = page.waitForEvent('requestfailed', {
      predicate: (request) => request.url().endsWith('/work-orders/order/original-file')
    })
    const downloaded = page.waitForEvent('download')
    await original.click()
    await cancelled
    const download = await downloaded
    releaseFirst()
    expect(download.suggestedFilename()).toBe('original.docx')
    const stream = (await download.createReadStream())!
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(originalBytes)
    await expect(page.locator('.el-alert--error')).toHaveCount(0)
    expect(writes.some((request) => request.method !== 'GET')).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
  })

  test(`真实原文件读取失败仍显示错误 ${path}`, async ({ adminApi, page }) => {
    await mockWorkOrder(page)
    await page.route('**/work-orders/order/original-file', (route) =>
      route.fulfill({
        status: 500,
        json: {
          code: 'ORIGINAL_FILE_UNAVAILABLE',
          message: '原文件暂时无法读取，请稍后重试',
          request_id: 'original-failure'
        }
      })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, path)
    await page.getByRole('button', { name: '查看原文件', exact: true }).click()
    await expect(page.locator('.el-alert--error')).toContainText('原文件暂时无法读取，请稍后重试')
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

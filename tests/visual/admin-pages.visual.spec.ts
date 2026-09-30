import { expect, test } from '../e2e/fixtures/admin-api'
import { pageManifest } from './page-manifest'

for (const adminPage of pageManifest) {
  for (const viewport of adminPage.viewports) {
    test(`${adminPage.id} ${adminPage.title} ${viewport.width}x${viewport.height}`, async ({
      adminApi,
      page
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize(viewport)
      await page.goto(adminPage.path)
      await expect(page.getByRole('heading', { level: 1, name: adminPage.title })).toBeVisible()
      await stabilizePage(page)
      await expect(page.getByText(/接口待接入|页面开发中/)).toHaveCount(0)
      if (adminPage.id === 'A25')
        await expect(page.getByText('80.0%', { exact: true })).toBeVisible()
      expect(adminApi.unexpectedRequests).toEqual([])
      expect(errors).toEqual([])

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))
      expect(overflow.scrollWidth).toBe(overflow.clientWidth)
      expect(await findUnnamedIconButtons(page)).toEqual([])

      await page.evaluate(() => {
        document.scrollingElement?.scrollTo(0, 0)
        for (const container of document.querySelectorAll<HTMLElement>('.main'))
          container.scrollTo(0, 0)
      })
      await page.screenshot({
        animations: 'disabled',
        path: `.impeccable/review/${adminPage.id}-${viewport.width}x${viewport.height}.png`
      })
    })
  }
}

/**
 * 等待字体与两帧布局完成并关闭非必要动画
 *
 * @param page - Playwright 页面
 * @returns 页面稳定后的 Promise
 */
async function stabilizePage(page: import('@playwright/test').Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
  })
  await page.evaluate(async () => {
    await document.fonts.ready
    window.scrollTo(0, 0)
    for (const container of document.querySelectorAll<HTMLElement>('.main'))
      container.scrollTo(0, 0)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
}

/**
 * 查找只有图标但缺少可访问名称的按钮
 *
 * @param page - Playwright 页面
 * @returns 缺少名称按钮的简短 HTML 数组
 */
async function findUnnamedIconButtons(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
        return Boolean(button.querySelector('svg, .el-icon')) && name.length === 0
      })
      .map((button) => button.outerHTML.slice(0, 180))
  )
}

import { expect, loginAsAdmin, test } from './fixtures/admin-api'

const dashboardViewports = [
  { height: 900, width: 1440 },
  { height: 800, width: 1280 }
] as const

for (const viewport of dashboardViewports) {
  test(`工作台业务卡片在 ${viewport.width}x${viewport.height} 下填满主内容区`, async ({
    adminApi,
    page
  }) => {
    void adminApi
    await page.setViewportSize(viewport)
    await loginAsAdmin(page)
    await expect(page.locator('.dashboard-page .panel')).toHaveCount(2)

    const geometry = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.main')
      const panels = Array.from(document.querySelectorAll<HTMLElement>('.dashboard-page .panel'))
      if (!main || panels.length !== 2) throw new Error('工作台布局节点缺失')

      const mainRect = main.getBoundingClientRect()
      const mainStyle = getComputedStyle(main)
      const expectedBottom = mainRect.bottom - Number.parseFloat(mainStyle.paddingBottom)
      return {
        expectedBottom,
        panelBottoms: panels.map((panel) => panel.getBoundingClientRect().bottom),
        viewportFillCount: document.querySelectorAll('.viewport-fill').length
      }
    })

    expect(geometry.viewportFillCount).toBe(1)
    for (const panelBottom of geometry.panelBottoms)
      expect(Math.abs(panelBottom - geometry.expectedBottom)).toBeLessThanOrEqual(1)
  })
}

test('侧栏使用可滚动的 Element Plus 导航并可到达最后一个入口', async ({ adminApi, page }) => {
  void adminApi
  await page.setViewportSize({ height: 800, width: 1280 })
  await loginAsAdmin(page)

  const scrollbar = page.locator('.menu-scrollbar')
  const scrollbarWrap = scrollbar.locator('.menu-scrollbar-wrap')
  const thumb = scrollbar.locator('.el-scrollbar__bar.is-vertical .el-scrollbar__thumb')
  await expect(scrollbar).toBeVisible()
  await scrollbar.hover()
  await expect(thumb).toBeVisible()
  await expect(thumb).toHaveCSS('border-radius', '4px')

  await scrollbarWrap.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(page.locator('.top-level-item', { hasText: '汇总统计' })).toBeVisible()
})

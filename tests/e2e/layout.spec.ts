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
  const finalMenuItem = page.locator('.top-level-item', { hasText: '汇总统计' })
  await expect(finalMenuItem).toBeInViewport()
  expect(await scrollbarWrap.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await finalMenuItem.click()
  await expect(page).toHaveURL(/\/analytics$/)

  await page.getByRole('button', { name: '折叠侧栏' }).click()
  await expect(page.locator('.aside')).toHaveClass(/collapsed/)
  const collapsedMessageItem = page.getByRole('menuitem', { name: '消息中心', exact: true })
  await expect(page.locator('.el-popper', { hasText: '消息中心' })).toHaveCount(1)
  await collapsedMessageItem.dispatchEvent('click')
  await expect(page).toHaveURL(/\/work-items$/)
})

test('窄屏单列下非空待办卡片保持自然高度', async ({ adminApi, page }) => {
  void adminApi
  await page.route('**/api/v1/admin/work-items', async (route) => {
    await route.fulfill({
      body: JSON.stringify([
        {
          due_at: '2026-09-29T08:00:00Z',
          key: 'FEEDBACK-1',
          kind: 'FEEDBACK_OVERDUE',
          priority_rank: 10
        }
      ]),
      contentType: 'application/json',
      status: 200
    })
  })
  await page.setViewportSize({ height: 800, width: 1000 })
  await loginAsAdmin(page)
  await expect(page.getByText('反馈处理已超时')).toBeVisible()

  const geometry = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.dashboard-page .content')
    const main = document.querySelector<HTMLElement>('.main')
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.dashboard-page .panel'))
    if (!content || !main || panels.length !== 2) throw new Error('工作台窄屏布局节点缺失')

    return {
      contentFlexGrow: getComputedStyle(content).flexGrow,
      gridTemplateColumns: getComputedStyle(content).gridTemplateColumns,
      mainClientHeight: main.clientHeight,
      mainScrollHeight: main.scrollHeight,
      panelBottoms: panels.map((panel) => panel.getBoundingClientRect().bottom),
      panelHeights: panels.map((panel) => panel.getBoundingClientRect().height)
    }
  })

  expect(geometry.contentFlexGrow).toBe('0')
  expect(geometry.gridTemplateColumns.split(' ')).toHaveLength(1)
  expect(geometry.panelBottoms[0]).toBeLessThan(geometry.panelBottoms[1])
  expect(geometry.mainScrollHeight).toBeGreaterThan(geometry.mainClientHeight)
  for (const panelHeight of geometry.panelHeights)
    expect(panelHeight).toBeLessThan(geometry.mainClientHeight)
})

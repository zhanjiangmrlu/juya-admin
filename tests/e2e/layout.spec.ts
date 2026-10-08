import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

const dashboardViewports = [
  { height: 900, width: 1440 },
  { height: 800, width: 1280 }
] as const

for (const viewport of dashboardViewports) {
  test(`权益筛选控件在 ${viewport.width}x${viewport.height} 下统一为中等尺寸`, async ({
    adminApi,
    page
  }) => {
    void adminApi
    await page.setViewportSize(viewport)
    await loginAsAdmin(page)
    await navigateInApp(page, '/entitlements')
    const controls = page.locator(
      '.filters .el-input__wrapper, .filters .el-select__wrapper, .filters .el-button'
    )
    await expect(controls).toHaveCount(8)
    const heights = await controls.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height)
    )
    expect(heights).toEqual([32, 32, 32, 32, 32, 32, 32, 32])
    await expect(page.getByRole('button', { name: '授予正式权益' })).toHaveCSS('height', '32px')
  })

  test(`工作台业务卡片在 ${viewport.width}x${viewport.height} 下按设计显示业务卡片与快捷入口`, async ({
    adminApi,
    page
  }) => {
    void adminApi
    await page.setViewportSize(viewport)
    await loginAsAdmin(page)
    await expect(page.locator('.dashboard-page .panel')).toHaveCount(2)

    const geometry = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll<HTMLElement>('.dashboard-page .panel'))
      const metrics = document.querySelector<HTMLElement>('.dashboard-page .metrics')
      const note = document.querySelector<HTMLElement>('.permission-note')
      if (!metrics || !note || panels.length !== 2) throw new Error('工作台布局节点缺失')
      return {
        metricBottom: metrics.getBoundingClientRect().bottom,
        panelRects: panels.map((panel) => {
          const rect = panel.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom, height: rect.height }
        }),
        noteTop: note.getBoundingClientRect().top,
        viewportFillCount: document.querySelectorAll('.viewport-fill').length
      }
    })

    expect(geometry.viewportFillCount).toBe(1)
    for (const panel of geometry.panelRects) {
      expect(panel.height).toBeGreaterThanOrEqual(342)
      expect(panel.top - geometry.metricBottom).toBeCloseTo(22, 0)
    }
    expect(geometry.panelRects[0]?.bottom).toBe(geometry.panelRects[1]?.bottom)
    expect(geometry.noteTop - geometry.panelRects[0]!.bottom).toBeCloseTo(24, 0)
    await expect(page.getByRole('region', { name: '常用管理入口' }).getByRole('link')).toHaveCount(
      4
    )
  })
}

test('侧栏使用可滚动的 Element Plus 导航并可到达最后一个入口', async ({ adminApi, page }) => {
  void adminApi
  await page.setViewportSize({ height: 800, width: 1280 })
  await loginAsAdmin(page)

  const scrollbar = page.locator('.menu-scrollbar')
  await scrollbar.locator('.el-sub-menu__title', { hasText: '统一权益中心' }).click()
  await scrollbar.locator('.el-sub-menu__title', { hasText: '内容生产' }).click()
  await expect(scrollbar.locator('.el-menu-item')).toHaveCount(14)
  await expect(scrollbar.locator('.el-menu-item.is-disabled')).toHaveCount(0)
  await expect(scrollbar).not.toContainText(/A03|A04|A08|A09|A11|A12|A15|A16|A19|A20|A21|A22/)
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

test('隐藏菜单后仍可从列表进入详情和操作页并返回所属栏目', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  const navigation = page.locator('.menu-scrollbar')
  await navigation.getByRole('menuitem', { name: '用户管理', exact: true }).click()
  await page.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page).toHaveURL(/\/users\/USER-1$/)
  await expect(navigation.locator('.el-menu-item.is-active')).toHaveText('用户管理')
  await page.getByRole('button', { name: '返回用户列表' }).click()
  await expect(page).toHaveURL(/\/users(?:\?|$)/)

  await navigation.locator('.el-sub-menu__title', { hasText: '统一权益中心' }).click()
  await navigation.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined))
    )
  })
  await navigation.getByRole('menuitem', { name: 'A05 统一权益中心' }).click()
  await expect(page).toHaveURL(/\/entitlements$/)
  await page
    .getByRole('row')
    .filter({ hasText: 'FORMAL-1' })
    .getByRole('link', { name: '查看' })
    .click()
  await expect(page).toHaveURL(/\/entitlements\/formal\/FORMAL-1\/action$/)
  await expect(navigation.locator('.el-menu-item.is-active')).toContainText('A05')
  await page.getByRole('button', { name: '返回权益中心' }).click()
  await expect(page).toHaveURL(/\/entitlements$/)

  await navigation.getByRole('menuitem', { name: '限时活动配置', exact: true }).click()
  await page.getByRole('link', { name: '编辑', exact: true }).click()
  await expect(page).toHaveURL(/\/campaigns\/CAMP-1\/edit$/)
  await expect(navigation.locator('.el-menu-item.is-active')).toHaveText('限时活动配置')
  await page.getByRole('button', { name: '查看版本与容量' }).click()
  await expect(page).toHaveURL(/\/campaigns\/CAMP-1\/versions$/)
  await expect(navigation.locator('.el-menu-item.is-active')).toHaveText('限时活动配置')
  await page.getByRole('button', { name: '返回活动列表' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  expect(adminApi.unexpectedRequests).toEqual([])
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
    const main = document.querySelector<HTMLElement>('.page-scrollbar-wrap')
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

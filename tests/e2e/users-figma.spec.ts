import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 }
]) {
  test(`用户与权益八页浏览器验收 ${viewport.width}`, async ({ adminApi, page }, testInfo) => {
    test.setTimeout(60_000)
    await page.setViewportSize(viewport)
    await loginAsAdmin(page)
    const routes = [
      ['A02', '/users', '.user-list-page'],
      ['A03', '/users/USER-1', '.user-detail-page'],
      ['A04', '/contacts/corrections/COR-1', '.contact-correction-page'],
      ['A05', '/entitlements', '.entitlement-center-page'],
      ['A06', '/entitlements/formal/grant', '.formal-grant-page'],
      ['A07', '/entitlements/limited/grant', '.limited-grant-page'],
      ['A08', '/entitlements/formal/FORMAL-1/action', '.formal-action-page'],
      ['A09', '/entitlements/limited/LIMITED-1/action', '.limited-action-page']
    ] as const
    for (const [id, route, selector] of routes) {
      await navigateInApp(page, route)
      await expect(page.locator(selector)).toBeVisible()
      if (id === 'A02') await expect(page.getByText('juya_verified')).toBeVisible()
      if (id === 'A03') await expect(page.getByText('开放场景完成数')).toBeVisible()
      if (id === 'A04') await expect(page.getByText('juya_verified')).toBeVisible()
      if (id === 'A05') await expect(page.getByRole('cell', { name: 'FORMAL-1' })).toBeVisible()
      if (id === 'A06') {
        await page.getByPlaceholder('输入用户编号').fill('USER-1')
        await page.getByRole('combobox', { name: /正式内容包/ }).click()
        await page.getByRole('option', { name: /基础内容包/ }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option', { name: /基础内容包/ })).toBeHidden()
      }
      if (id === 'A07') {
        await page.getByPlaceholder('输入用户编号').fill('USER-1')
        await page.getByRole('combobox', { name: /开放中的活动/ }).click()
        await page.getByRole('option', { name: /秋季限时学习/ }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option', { name: /秋季限时学习/ })).toBeHidden()
        await expect(page.getByRole('button', { name: '二次确认并开通' })).toBeEnabled()
      }
      if (id === 'A08')
        await expect(page.getByRole('button', { name: '获取服务端预览并二次确认' })).toBeEnabled()
      if (id === 'A09')
        await expect(page.getByRole('button', { name: '二次确认并执行' })).toBeEnabled()
      await expect(page.locator('main')).not.toContainText('接口待接入')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(0)
      await page.evaluate(async () => {
        const transitions = document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)))
      })
      await page.screenshot({
        path: testInfo.outputPath(`${id}-${viewport.width}.png`),
        fullPage: true
      })
    }
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

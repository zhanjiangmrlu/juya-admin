import { expect, test } from '@playwright/test'

/** 真实H5及匿名API验收设置、政策、游客原位登录提示；不调用真实微信身份 */
test('mini settings preserves public privacy and cancel source through live anonymous APIs', async ({
  page
}) => {
  test.skip(
    process.env.JUYA_CHG0041_LIVE !== 'owned-fixture',
    'Requires explicitly started owned fixture'
  )
  const logins: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/auth/wechat')) logins.push(request.url())
  })
  await page.setViewportSize({ width: 390, height: 845 })
  await page.goto('http://127.0.0.1:4196/#/pages/profile/index')
  await page.getByText('设置', { exact: true }).click()
  await expect(page).toHaveURL(/account\/settings/)
  await expect(page.locator('.settings-row')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/chg0041-mini-settings-live.png' })
  await page.locator('[data-action="privacy"]').click()
  const sheet = page.getByRole('dialog', { name: '隐私说明', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('真实统计未运行')
  await page.getByRole('switch', { name: '友盟使用统计', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '用户协议与隐私保护', exact: true })).toBeVisible()
  await expect(sheet).toBeHidden()
  await page.locator('.consent-card .close').click()
  await expect(sheet).toBeVisible()
  expect(logins).toEqual([])
  await page.screenshot({ path: 'test-results/chg0041-mini-privacy-after-cancel-live.png' })
  await page.locator('.sheet .close').click()
  await expect(page.locator('.settings-row')).toHaveCount(2)
  await page.locator('[data-action="terms"]').click()
  await expect(page).toHaveURL(/policy\?kind=terms/)
  await expect(page.locator('.policy-body')).toContainText('用户协议')
  await page.goBack()
  await expect(page.locator('.settings-row')).toHaveCount(2)
  await page.goto('http://127.0.0.1:4196/#/sub-packages/account/policy')
  await expect(page).toHaveURL(/settings\?privacy=1&source=profile/)
  await expect(page.getByRole('dialog', { name: '隐私说明', exact: true })).toBeVisible()
  expect(logins).toEqual([])
})

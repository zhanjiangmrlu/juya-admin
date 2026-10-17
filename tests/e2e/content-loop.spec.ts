import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

// Local synthetic credentials and files are provided by the verification runner.
const settings = JSON.parse(readFileSync(process.env.JUYA_E2E_CREDENTIALS_FILE!, 'utf8'))
const fixtureDirectory = process.env.JUYA_E2E_FIXTURES!
test('real admin login, private upload, immutable publication and stale editor conflict', async ({
  page,
  context
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(settings.username)
  await page.getByLabel('密码', { exact: true }).fill(settings.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '新建卡片' }).click()
  const name = `浏览器验收咖啡场景-${Date.now()}`
  await page.getByLabel('卡片名称', { exact: true }).fill(name)
  await page
    .locator('input[type="file"][accept=".jpg,.jpeg,.png,.webp"]')
    .setInputFiles(`${fixtureDirectory}/scene.png`)
  await expect(page.getByAltText('当前场景图')).toBeVisible()
  await page
    .locator('input[type="file"][accept=".mp3,.m4a,.wav,.aac"]')
    .setInputFiles(`${fixtureDirectory}/dialogue.wav`)
  await expect(page.getByText('2 秒', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '＋ 添加一组对话' }).click()
  await page.getByLabel('人物', { exact: true }).fill('顾客')
  await page.getByLabel('英文台词').fill('May I have a coffee, please?')
  await page.getByLabel('中文台词').fill('请给我一杯咖啡。')
  await page.getByRole('button', { name: '＋ 添加词汇' }).click()
  await page.getByLabel('英文词汇').fill('coffee')
  await page.getByLabel('本句中文释义').fill('咖啡')
  await expect(page.getByText('唯一对应位置')).toBeVisible()
  await page.getByRole('button', { name: '＋ 添加语块' }).click()
  await page.locator('#field-chunks').getByLabel('英文', { exact: true }).fill('May I')
  await page.locator('#field-chunks').getByLabel('中文释义', { exact: true }).fill('我可以')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page).toHaveURL(/\/cards\/[a-f0-9-]+$/)
  const editorURL = page.url()
  await expect(page.getByText('草稿已保存', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.locator('#field-chunks').getByLabel('英文', { exact: true })).toHaveValue(
    'May I'
  )
  await expect(page.locator('#field-chunks').getByLabel('中文释义', { exact: true })).toHaveValue(
    '我可以'
  )
  await page.locator('#field-chunks').getByLabel('中文释义', { exact: true }).fill('我可以……吗？')
  await page.getByRole('button', { name: '预览并发布', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '发布前预览' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '发布前预览' })).toContainText('我可以……吗？')
  await page.screenshot({ path: 'test-results/publication-preview.png', fullPage: true })
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row).toContainText('已发布')
  await row.getByRole('button', { name: '查看效果' }).click()
  await expect(page.getByRole('dialog', { name: '已发布内容 · 只读查看' })).toContainText(
    '我可以……吗？'
  )
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await row.getByRole('link', { name: '编辑', exact: true }).click()
  const other = await context.newPage()
  await other.goto(editorURL)
  await other.getByLabel('卡片名称', { exact: true }).fill(`${name}-旧窗口`)
  await page.getByLabel('卡片名称', { exact: true }).fill(`${name}-未发布候选`)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('草稿已保存', { exact: true }).first()).toBeVisible()
  await other.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(other.getByRole('alert').filter({ hasText: '资料已变化' })).toHaveCount(1)
  await expect(other.getByRole('alert').filter({ hasText: '资料已变化' })).toBeVisible()
  await expect(other.getByLabel('卡片名称', { exact: true })).toHaveValue(`${name}-旧窗口`)
  await other.close()
  await page.getByRole('link', { name: '‹ 返回卡片管理' }).click()
  await expect(row).toContainText('有未发布修改')
  await expect(row.locator('.name')).toHaveText(name)
  await row.getByRole('button', { name: '查看效果' }).click()
  await expect(
    page
      .getByRole('dialog', { name: '已发布内容 · 只读查看' })
      .getByRole('heading', { name, exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await page.screenshot({ path: 'test-results/card-management.png', fullPage: true })
  await page.getByRole('link', { name: '数据统计', exact: true }).click()
  await expect(page.locator('.metric-value')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true })
  expect(errors).toEqual([])
})

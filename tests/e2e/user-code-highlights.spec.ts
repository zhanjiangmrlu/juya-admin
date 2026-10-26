import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

test('publishes overlapping highlights and uses one stable code across users and feedback', async ({
  page
}, info) => {
  const fixturePath = process.env.JUYA_E2E_OVERLAP_FIXTURE
  test.skip(!fixturePath, 'Requires the isolated overlap/user-code verification fixture')
  const fixture = JSON.parse(readFileSync(fixturePath!, 'utf8'))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(fixture.username)
  await page.getByLabel('密码', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto(`/cards/${fixture.card_id}`)
  await page.getByRole('button', { name: '预览并发布', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '发布前预览' })
  await expect(preview.locator('.dialogue .english')).toHaveText('😀 tea and coffee.')
  await expect(preview.locator('.dialogue mark')).toHaveText('tea and coffee')
  await preview.screenshot({
    path: info.outputPath('overlapping-preview.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto('/users?search=Juya001')
  const users = page.locator('tbody')
  await expect(users).toContainText('Juya001')
  await expect(users).not.toContainText(fixture.user_id)
  await page.getByRole('link', { name: '查看详情', exact: true }).click()
  await expect(page.locator('.profile-fields')).toContainText('Juya001')
  await expect(page).toHaveURL(new RegExp(`/users/${fixture.user_id}`))
  await page.goto('/feedback?search=Juya001')
  const feedback = page.locator('tbody')
  await expect(feedback).toContainText('Juya001')
  await expect(feedback).toContainText(fixture.feedback_id)
  await expect(feedback).not.toContainText(fixture.user_id)
  await page.screenshot({
    path: info.outputPath('feedback-user-code.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await page.getByRole('link', { name: '查看并处理', exact: true }).click()
  await expect(page.locator('.feedback-history h2')).toHaveText(`${fixture.feedback_id} · Juya001`)
  expect(errors).toEqual([])
})

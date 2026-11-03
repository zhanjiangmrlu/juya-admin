import { expect, test } from '@playwright/test'

const user = {
  id: 'visual-user',
  user_code: 'Juya001',
  nickname: '学习者',
  registered_at: '2026-11-03T03:00:00Z',
  authorization: {
    status: 'none',
    starts_on: null,
    expires_on: null,
    expires_at: null,
    revision: 1
  },
  statistics: {
    completed_cards: 2,
    completed_articles: 3,
    current_streak: 1,
    total_checkin_days: 2,
    checked_in_today: true
  }
}

test('authorization date stays a date-only string and confirmation is required before saving', async ({
  page
}) => {
  let requestedDate = '',
    saves = 0
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = { items: [], total: 0, page: 1, limit: 20 }
    if (path.endsWith('/auth/session'))
      json = { id: 'synthetic-admin', username: 'admin', csrf_token: 'synthetic' }
    else if (path.endsWith('/users/visual-user')) json = user
    else if (path.endsWith('/learning-authorization/preview')) {
      requestedDate = route.request().postDataJSON().expires_on
      json = {
        preview_token: 'synthetic-preview',
        before: user.authorization,
        after: { ...user.authorization, status: 'active', expires_on: requestedDate }
      }
    } else if (path.endsWith('/learning-authorization') && route.request().method() === 'PUT') {
      saves++
      json = { ...user.authorization, status: 'active', revision: 2, expires_on: requestedDate }
    }
    await route.fulfill({ json })
  })
  await page.goto('/users/visual-user')
  await page.getByRole('button', { name: '指定到期日', exact: true }).click()
  await page.getByLabel('授权到期日期', { exact: true }).fill('2026-11-30')
  await page.getByLabel('授权到期日期', { exact: true }).press('Enter')
  await page.getByRole('button', { name: '核对日期', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '指定到期日', exact: true })
  await expect(dialog).toBeVisible()
  expect(requestedDate).toBe('2026-11-30')
  expect(saves).toBe(0)
  await expect(dialog).toContainText('2026-11-30')
  await page.screenshot({ path: 'test-results/management-authorization-confirmation.png' })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(saves).toBe(0)
})

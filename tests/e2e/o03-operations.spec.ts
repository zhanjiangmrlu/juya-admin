import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

for (const width of [1280, 1440]) {
  test(`运营六类指标和数据库分页筛选 ${width}`, async ({ adminApi, page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 })
    await page.route('**/api/v1/admin/dashboard', (route) =>
      route.fulfill({
        json: {
          active_users: 125,
          open_feedback: 3,
          overdue_feedback: 1,
          expiring_entitlements: 2,
          failed_jobs: 1,
          new_users_today: 125,
          open_completed_without_contact: 8,
          pending_contacts: 5,
          limited_pending: 3,
          limited_learning: 2,
          urgent_feedback: 3,
          entitlement_warning_days: 30
        }
      })
    )
    const queries: URL[] = []
    await page.route('**/api/v1/admin/users**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/api/v1/admin/users') return route.fallback()
      queries.push(url)
      const current = Number(url.searchParams.get('page') || 1)
      return route.fulfill({
        json: Array.from({ length: current === 1 ? 20 : 1 }, (_, index) => ({
          user_id: `USER-${current}-${index}`,
          account_status: 'ACTIVE',
          nickname: `学习者${current}-${index}`,
          juya_number: `JY${current}${index}`,
          avatar_url: null,
          last_active_at: null,
          contact: null,
          contact_degraded: false,
          formal_entitlement_count: 1,
          limited_entitlement_count: 2,
          open_feedback_count: 3,
          open_scene_completed_count: 3,
          change_pending: true
        }))
      })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/dashboard')
    for (const name of [
      '今日新增用户',
      '完成开放场景但未填写微信号',
      '待联系用户',
      '限时权益待开始',
      '限时学习中',
      '反馈紧急待办'
    ])
      await expect(page.getByText(name, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: '待联系用户 5' }).click()
    await expect(page.getByText('学习者1-0', { exact: true })).toBeVisible()
    expect(queries.at(-1)?.searchParams.get('contact_status')).toBe('PENDING')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page.getByText('学习者2-0', { exact: true })).toBeVisible()
    expect(queries.at(-1)?.searchParams.get('page')).toBe('2')
    await page.getByRole('combobox', { name: '权益类型筛选' }).press('ArrowDown')
    await page.getByRole('option', { name: '限时包', exact: true }).click()
    await page.getByRole('combobox', { name: '资料完整度筛选' }).press('ArrowDown')
    await page.getByRole('option', { name: '昵称头像完整', exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect
      .poll(() => queries.at(-1)?.searchParams.get('profile_completeness'))
      .toBe('COMPLETE')
    expect(queries.at(-1)?.searchParams.get('entitlement_type')).toBe('LIMITED')
    expect(queries.at(-1)?.searchParams.get('page')).toBe('1')
    await page.getByRole('combobox', { name: '权益类型筛选' }).press('ArrowDown')
    await page.getByRole('option', { name: '正式包', exact: true }).click()
    await page.getByRole('combobox', { name: '权益状态筛选' }).press('ArrowDown')
    await page.getByRole('option', { name: '正式权益已到期', exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => queries.at(-1)?.searchParams.get('entitlement_status')).toBe('EXPIRED')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
    ).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
    expect(errors).toEqual([])
    await page.screenshot({ path: `test-results/o03/users-${width}.png`, fullPage: true })
  })
}

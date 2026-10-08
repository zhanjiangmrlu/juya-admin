import { expect, test } from './fixtures/admin-api'

for (const withResponses of [true, false]) {
  test(`统计概览按区间加权响应时间并保留库存与缺失语义：${withResponses ? '有响应' : '无响应'}`, async ({
    adminApi,
    page
  }) => {
    void adminApi
    await page.route('**/api/v1/admin/analytics?*', async (route) => {
      const url = new URL(route.request().url())
      const end = url.searchParams.get('end')!
      const previous = new Date(`${end}T00:00:00Z`)
      previous.setUTCDate(previous.getUTCDate() - 1)
      const days = [previous.toISOString().slice(0, 10), end]
      const buckets = days.map((day, index) => ({
        day,
        numerator: withResponses ? [3600, 64800][index]! : 0,
        denominator: withResponses ? [1, 9][index]! : 0
      }))
      const metric = 'FEEDBACK_RESPONSE_SECONDS'
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          start: url.searchParams.get('start'),
          end,
          period: 'day',
          timezone: 'Asia/Shanghai',
          activity_basis: 'DAILY_USERS',
          rows: [
            { day: end, metric: 'NEW_USERS', dimension: 'ALL', value: 0 },
            { day: days[0], metric: 'LIMITED_STATES', dimension: 'ACTIVE', value: 4 },
            { day: end, metric: 'LIMITED_STATES', dimension: 'ACTIVE', value: 5 },
            ...buckets.flatMap((bucket) => [
              { day: bucket.day, metric, dimension: 'NUMERATOR', value: bucket.numerator },
              { day: bucket.day, metric, dimension: 'DENOMINATOR', value: bucket.denominator }
            ])
          ],
          ratios: buckets.map((bucket) => ({
            ...bucket,
            metric,
            unit: 'seconds',
            rate: bucket.denominator ? bucket.numerator / bucket.denominator : null,
            basis: '累计首次响应秒数 / 首次响应反馈数量'
          }))
        })
      })
    })
    await page.goto('/analytics')
    const overview = page.locator('.overview-card')
    await expect(
      overview.locator('dl > div').filter({ hasText: '平均首次响应时间' }).locator('dd')
    ).toHaveText(withResponses ? '1.9 小时' : '—')
    await expect(
      overview.locator('dl > div').filter({ hasText: '限时权益学习中' }).locator('dd')
    ).toHaveText('5')
    await expect(
      page.locator('.summary-metrics .el-card').filter({ hasText: '新增用户' }).locator('strong')
    ).toHaveText('0')
    await expect(
      page
        .locator('.summary-metrics .el-card')
        .filter({ hasText: '开放场景完成' })
        .locator('strong')
    ).toHaveText('—')
  })
}

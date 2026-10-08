import { expect, test } from './fixtures/admin-api'

test('联系资料修改与去重转化率不会阻断汇总展示和导出', async ({ adminApi, page }) => {
  void adminApi
  await page.route('**/api/v1/admin/analytics?*', async (route) => {
    const url = new URL(route.request().url())
    const day = url.searchParams.get('end')!
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        start: url.searchParams.get('start'),
        end: day,
        period: 'day',
        timezone: 'Asia/Shanghai',
        activity_basis: 'DAILY_USERS',
        rows: [
          { day, metric: 'NEW_USERS', dimension: 'ALL', value: 13 },
          { day, metric: 'ACTIVE_USERS', dimension: 'ALL', value: 7 },
          { day, metric: 'OPEN_SCENE_COMPLETIONS', dimension: 'ALL', value: 0 },
          { day, metric: 'FEEDBACK_STATES', dimension: 'PENDING', value: 0 },
          { day, metric: 'CONTACT_CHANGES', dimension: 'ALL', value: 2 },
          { day, metric: 'CONTACT_CHANGES', dimension: 'PENDING', value: 2 },
          { day, metric: 'CONTACT_FUNNEL', dimension: 'NUMERATOR', value: 3 },
          { day, metric: 'CONTACT_FUNNEL', dimension: 'DENOMINATOR', value: 3 }
        ],
        ratios: [
          {
            day,
            metric: 'CONTACT_FUNNEL',
            numerator: 3,
            denominator: 3,
            rate: 1,
            basis: '首次填写转化数(按曝光去重) / 提示曝光次数'
          }
        ]
      })
    })
  })
  await page.goto('/analytics')
  await expect(page.locator('.summary-metrics strong')).toHaveText(['13', '7', '0', '0'])
  await expect(page.getByText('统计响应包含未知指标')).toHaveCount(0)
  await expect(page.getByText('当前区间没有匿名汇总数据，可调整日期后重试')).toHaveCount(0)
  await expect(page.getByLabel('匿名汇总指标趋势图')).toBeVisible()
  await expect(page.getByLabel('统计比率口径')).toContainText(
    '首次填写转化数(按曝光去重) / 提示曝光次数'
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出已校验数据' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  let exported = ''
  for await (const chunk of stream!) exported += String(chunk)
  const snapshot = JSON.parse(exported)
  expect(snapshot.rows).toContainEqual(
    expect.objectContaining({
      metric: 'CONTACT_CHANGES',
      dimension: 'ALL',
      value: 2
    })
  )
  expect(snapshot.ratios[0]).toMatchObject({ metric: 'CONTACT_FUNNEL', rate: 1 })
})

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

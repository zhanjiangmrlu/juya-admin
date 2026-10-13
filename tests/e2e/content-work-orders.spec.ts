import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder } from './fixtures/content-work-orders'

test('工作单保持整单统计，旧批次恢复，阅读修正始终保留不可变原文', async ({
  adminApi,
  page
}, testInfo) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  const requests = await mockWorkOrder(page)
  await loginAsAdmin(page)
  await page.evaluate(async () => {
    const app = document.querySelector('#app') as Element & {
      __vue_app__?: {
        config: { globalProperties: { $router: { push(path: string): Promise<void> } } }
      }
    }
    await app.__vue_app__?.config.globalProperties.$router.push(
      '/content/jobs?batch_id=legacy-batch'
    )
  })
  await expect(page).toHaveURL(/content\/work-orders\/order/)
  await expect(page.getByText('1000', { exact: true })).toBeVisible()
  await expect(page.getByText('900', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '修正正文与译文', exact: true }).click()
  await expect(page.getByText('The immutable original paragraph.', { exact: true })).toBeVisible()
  if (!(await page.getByLabel('全文中文翻译', { exact: true }).isVisible()))
    await page.getByText('编辑正文与译文', { exact: true }).click()
  await page.getByLabel('全文中文翻译', { exact: true }).fill('修改后的完整译文。')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => requests.filter((req) => req.path.endsWith('/correction')).length).toBe(1)
  const saved = requests.find((req) => req.path.endsWith('/correction'))!
  expect(saved.headers['idempotency-key']).toBeTruthy()
  expect(saved.headers['x-idempotency-key']).toBeUndefined()
  expect(saved.body).toMatchObject({
    expected_revision_id: 'revision',
    expected_edit_version: 1,
    current: { template: 'short_reading', content: { translation_zh: '修改后的完整译文。' } }
  })
  await expect(page.getByText('The immutable original paragraph.', { exact: true })).toBeVisible()
  await expect(page.getByText('词汇', { exact: true })).toHaveCount(0)
  await expect(page.getByText('整段音频、句子边界与切片', { exact: true })).toHaveCount(0)
  await page.locator('.page-scrollbar-wrap').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: testInfo.outputPath('work-order-reading-1280.png'),
    fullPage: true
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    path: testInfo.outputPath('work-order-reading-1440.png'),
    fullPage: true
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

test('词汇卡修正保留显式含义选择，语块没有图片位', async ({ adminApi, page }, testInfo) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  await mockWorkOrder(page)
  const entry = {
    entry_id: 'local-word',
    entry_version: 1,
    sense_id: 'sense',
    source_id: 'source',
    english: 'coffee',
    chinese: '咖啡',
    confirmed: false,
    source_sentence: 'I like coffee.',
    source_sentence_ids: ['line'],
    variants: [],
    allow_synthesis: false
  }
  await page.route('**/work-orders/order/items/one', async (route) => {
    await route.fulfill({
      json: {
        ...item,
        title_en: 'Coffee card',
        current: {
          template: 'word_card',
          content: {
            schema_version: 2,
            template_type: 'word_card',
            title_en: 'Coffee card',
            title_zh: '咖啡词汇卡',
            summary: '认识日常词汇',
            source: '原创',
            copyright: '已授权',
            dialogue: [],
            vocabulary: [entry],
            chunks: [
              { ...entry, entry_id: 'local-chunk', english: 'a cup of coffee', chinese: '一杯咖啡' }
            ]
          }
        }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=entries')
  await expect(
    page.getByText('原词汇卡：核对主体单词与本篇释义，不要求对话、整段音频或句子切片', {
      exact: true
    })
  ).toBeVisible()
  await expect(
    page.getByText('语块不配置图片，用户端使用纯文字列表；音标仅在适用且已确认时保存。', {
      exact: true
    })
  ).toBeVisible()
  await expect(page.getByText('独立发音目标编号（可空）', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '整段音频、句子边界与切片' })).toHaveCount(0)
  await page.getByText('编辑文字资料', { exact: true }).first().click()
  await page.getByLabel('vocabulary 中文 1', { exact: true }).fill('咖啡饮品')
  await expect(page.getByText('释义变化类型', { exact: true }).first()).toBeVisible()
  await page.locator('.page-scrollbar-wrap').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: testInfo.outputPath('work-order-word-card-1280.png'),
    fullPage: true
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

test('本批抽样要求实际人工检查并刷新哈希后确认发布范围', async ({ adminApi, page }, testInfo) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  const requests = await mockWorkOrder(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order')
  await page.getByRole('button', { name: '开始正常抽样', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认已检查本篇', exact: true })).toBeDisabled()
  await page.getByText('已核对完整中英文、人物与顺序、排版', { exact: true }).click()
  await page.getByRole('button', { name: '确认已检查本篇', exact: true }).click()
  await expect.poll(() => requests.filter((req) => req.body.operation === 'confirm').length).toBe(1)
  await page
    .getByText('已完成本批所有样本检查，确认其余正常结果；异常项继续保留草稿', { exact: true })
    .click()
  await page.getByRole('button', { name: '批量确认正常结果', exact: true }).click()
  await expect
    .poll(() => requests.find((req) => req.body.operation === 'bulk-confirm')?.body.collection_hash)
    .toBe('c'.repeat(64))
  await page.getByRole('button', { name: '完成校对，预览合格范围', exact: true }).click()
  await page.getByRole('button', { name: '预览全部合格篇目', exact: true }).click()
  await page.getByText('已核对本次发布范围与来源 / 版权备注', { exact: true }).click()
  await page.getByRole('button', { name: '确认发布 1 篇', exact: true }).click()
  await expect(page.getByText('成功已保留', { exact: true })).toBeVisible()
  expect(requests.find((req) => req.path.endsWith('/publication-preview'))?.body.scope).toBe(
    'publishable'
  )
  expect(requests.some((req) => req.path.endsWith('/content/scenes'))).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('work-order-publication-1280.png'),
    fullPage: true
  })
})

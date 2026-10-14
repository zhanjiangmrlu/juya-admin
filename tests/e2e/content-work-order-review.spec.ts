import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order, reading, scene } from './fixtures/content-work-orders'

test('阅读修正首载和保存重读均跳过词条绑定并读取固定全文音频', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, {
    template: 'short_reading',
    content: {
      ...reading,
      audio: {
        asset_id: 'reading-audio',
        target_id: 'full-target',
        version_id: 'full-version',
        duration_ms: 8900
      }
    }
  })
  let bindings = 0
  let signed = 0
  await page.route('**/work-orders/order/items/one/entry-bindings*', (route) => {
    bindings++
    return route.fulfill({
      status: 404,
      json: { code: 'WORK_REVISION_NOT_FOUND', message: '版本不属于此工作单篇目' }
    })
  })
  await page.route('**/media/assets/reading-audio/signed-url', (route) => {
    signed++
    return route.fulfill({ json: { url: `/reading-full-${signed}.mp3` } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect(page.locator('audio[src="/reading-full-1.mp3"]')).toBeVisible()
  expect(bindings).toBe(0)
  await expect(page.getByText('版本不属于此工作单篇目', { exact: true })).toHaveCount(0)
  await page.getByText('编辑元信息', { exact: true }).click()
  await page.getByLabel('英文标题', { exact: true }).fill('Corrected reading')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect(page.locator('audio[src="/reading-full-2.mp3"]')).toBeVisible()
  await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue('Corrected reading')
  expect(bindings).toBe(0)
  expect(requests.filter((request) => request.path.endsWith('/correction'))).toHaveLength(1)
})

for (const delayed of ['detail', 'audio'] as const) {
  test(`抽样 A 的 ${delayed} 迟到不能覆盖 B 或作为 B 的试听`, async ({ adminApi, page }) => {
    expect(adminApi).toBeDefined()
    await mockWorkOrder(page)
    await page.route('**/work-orders/order', (route) =>
      route.fulfill({
        json: { ...order, counts: { ...order.counts, total: 2 }, proofreading_set_id: 'set' }
      })
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = false
    const members = ['A', 'B'].map((name) => ({
      ...item,
      item_id: name,
      revision_id: `revision-${name}`,
      candidate_hash: name.repeat(64),
      title_en: `Sample ${name}`,
      current: {
        template: 'short_reading',
        content: {
          ...reading,
          title_en: `Sample ${name}`,
          audio: { asset_id: `audio-${name}`, version_id: `version-${name}` }
        }
      }
    }))
    await page.route('**/work-orders/order/items?*', (route) =>
      route.fulfill({
        json: {
          items: members,
          total: 2,
          version: 1,
          collection_hash: 'sample-scope',
          counts: { ...order.counts, total: 2 }
        }
      })
    )
    await page.route('**/work-orders/order/sampling', (route) =>
      route.fulfill({
        json: {
          work_order_id: 'order',
          proofreading_set_id: 'set',
          collection_hash: 'collection',
          sample_ids: members.map((row) => row.revision_id),
          candidates: members,
          confirmed_revision_ids: [],
          normal_count: 2
        }
      })
    )
    await page.route('**/work-orders/order/items/*', async (route) => {
      const name = route.request().url().split('/').at(-1)
      if (name === 'A' && delayed === 'detail') {
        held = true
        await gate
      }
      await route.fulfill({ json: members.find((row) => row.item_id === name) })
    })
    await page.route('**/media/assets/audio-*/signed-url', async (route) => {
      const name = route.request().url().includes('audio-A') ? 'A' : 'B'
      if (name === 'A' && delayed === 'audio') {
        held = true
        await gate
      }
      await route.fulfill({ json: { url: `/fixed-audio-${name}.mp3` } })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order?view=sampling')
    await expect.poll(() => held).toBe(true)
    await page.getByRole('combobox', { name: '工作单内篇目' }).press('Enter')
    await page.getByRole('option', { name: 'Sample B · 样本', exact: true }).click()
    await expect(page.locator('audio[src="/fixed-audio-B.mp3"]').first()).toBeVisible()
    const done = page.waitForResponse((response) =>
      response.url().includes(delayed === 'detail' ? '/items/A' : '/audio-A/signed-url')
    )
    release()
    await done
    await expect(page.locator('audio[src="/fixed-audio-A.mp3"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Sample B', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '确认已检查本篇', exact: true })).toBeDisabled()
  })
}

test('当前样本签名失败不能继承旧试听，支持重新读取当前固定资源', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await mockWorkOrder(page, {
    template: 'short_reading',
    content: { ...reading, audio: { asset_id: 'failed-audio', version_id: 'fixed-version' } }
  })
  await page.route('**/work-orders/order', (route) =>
    route.fulfill({ json: { ...order, proofreading_set_id: 'set' } })
  )
  let failed = true
  await page.route('**/media/assets/failed-audio/signed-url', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { code: 'MEDIA_UNAVAILABLE', message: '签名暂不可用' } }
        : { json: { url: '/fixed-success.mp3' } }
    )
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=sampling')
  await expect(page.getByText(/服务暂时不可用/).first()).toBeVisible()
  await page.getByText('已核对完整中英文、人物与顺序、排版', { exact: true }).click()
  await expect(page.getByRole('button', { name: '确认已检查本篇', exact: true })).toBeDisabled()
  failed = false
  await page.getByRole('button', { name: '重新读取本篇媒体', exact: true }).click()
  await expect(page.locator('audio[src="/fixed-success.mp3"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '确认已检查本篇', exact: true })).toBeDisabled()
})

test('逐条确认保存后使用新身份，只确认选中的词条', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, { template: 'word_card', content: scene })
  const current = structuredClone({
    ...item,
    current: {
      template: 'word_card',
      content: {
        ...scene,
        template_type: 'word_card',
        vocabulary: [
          scene.vocabulary[0]!,
          { ...scene.vocabulary[0]!, entry_id: 'second', english: 'tea', chinese: '茶' }
        ]
      }
    }
  })
  const confirmations: string[] = []
  await page.route('**/work-orders/order/items/one', (route) => route.fulfill({ json: current }))
  await page.route('**/work-orders/order/items/one/correction', async (route) => {
    current.current.content = route.request().postDataJSON().current.content
    current.current.content.vocabulary[0]!.entry_id = 'replacement-entry'
    current.edit_version = 2
    await route.fulfill({ json: { status: 'SAVED' } })
  })
  await page.route('**/content/revisions/revision/entries/*/confirm', async (route) => {
    const entryId = route.request().url().split('/').at(-2)!
    confirmations.push(entryId)
    expect(route.request().postDataJSON()).toEqual({ expected_version: 2, manual_checked: true })
    current.current.content.vocabulary.find((row) => row.entry_id === entryId)!.confirmed = true
    await route.fulfill({ json: {} })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=entries')
  await page.getByText('编辑文字资料', { exact: true }).first().click()
  await page.getByRole('button', { name: '保存并确认这篇义项与来源', exact: true }).first().click()
  await expect.poll(() => confirmations).toEqual(['replacement-entry'])
  expect(requests.some((row) => row.path.endsWith('/entry-confirmations'))).toBe(false)
  await expect(page.getByText('服务端已确认本篇义项', { exact: true })).toHaveCount(1)
  await page.getByText('编辑文字资料', { exact: true }).nth(1).click()
  await expect(
    page.getByRole('button', { name: '保存并确认这篇义项与来源', exact: true })
  ).toBeVisible()
})

test('中文缺少含义选择时保留可编辑输入，补选后提交原中文', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, {
    template: 'word_card',
    content: { ...scene, template_type: 'word_card' }
  })
  let attempts = 0
  await page.route('**/work-orders/order/items/one/correction', async (route) => {
    attempts++
    if (!route.request().postDataJSON().current.content.vocabulary[0].meaning_change)
      await route.fulfill({
        status: 409,
        json: { code: 'MEANING_CHANGE_CONFIRMATION_REQUIRED', message: '请选择措辞修订或新义项' }
      })
    else await route.fallback()
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=entries')
  await page.getByText('编辑文字资料', { exact: true }).first().click()
  await page.getByLabel('vocabulary 中文 1', { exact: true }).fill('拿铁咖啡饮品')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => attempts).toBe(1)
  await expect(page.getByLabel('vocabulary 中文 1', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('vocabulary 中文 1', { exact: true })).toHaveValue('拿铁咖啡饮品')
  await page
    .locator('.el-form-item')
    .filter({ has: page.getByText('释义变化类型', { exact: true }) })
    .getByRole('combobox')
    .press('Enter')
  await page.getByRole('option', { name: '修改同一含义的措辞', exact: true }).click()
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect
    .poll(() => requests.find((row) => row.path.endsWith('/correction'))?.body)
    .toMatchObject({
      current: { content: { vocabulary: [{ chinese: '拿铁咖啡饮品', meaning_change: 'wording' }] } }
    })
})

test('真正版本冲突展示双方内容，明确重新应用后才可按新版本保存', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page)
  let attempts = 0
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: attempts
        ? {
            ...item,
            edit_version: 7,
            content_version: 7,
            candidate_hash: 'fresh',
            current: {
              ...item.current,
              content: { ...reading, translation_zh: '远端新的完整译文' }
            }
          }
        : item
    })
  )
  await page.route('**/work-orders/order/items/one/correction', async (route) => {
    attempts++
    if (attempts === 1)
      await route.fulfill({
        status: 409,
        json: { code: 'WORK_ITEM_VERSION_CONFLICT', message: '当前候选已更新' }
      })
    else await route.fallback()
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await page.getByText('编辑正文与译文', { exact: true }).click()
  await page.getByLabel('全文中文翻译', { exact: true }).fill('需要保留的本地译文')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect(page.getByText('远端新的完整译文', { exact: true })).toBeVisible()
  await expect(
    page.locator('.conflict-row').getByText('需要保留的本地译文', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '保存候选修正', exact: true })).toBeDisabled()
  expect(attempts).toBe(1)
  await page.getByRole('button', { name: '已对照差异，保留本地输入继续编辑', exact: true }).click()
  expect(attempts).toBe(1)
  await expect(page.getByLabel('全文中文翻译', { exact: true })).toHaveValue('需要保留的本地译文')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect
    .poll(() => requests.find((row) => row.path.endsWith('/correction'))?.body)
    .toMatchObject({
      expected_edit_version: 7,
      expected_content_version: 7,
      candidate_hash: 'fresh',
      current: { content: { translation_zh: '需要保留的本地译文' } }
    })
})

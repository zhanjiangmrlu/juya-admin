import { Buffer } from 'node:buffer'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test.beforeEach(async ({ page, adminApi }) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  const wav = Buffer.alloc(44 + 64_000)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(64_000, 40)
  await page.route('**/c02/audio.wav', (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '')
    const start = range ? Number(range[1]) : 0
    const end = range?.[2] ? Number(range[2]) : wav.length - 1
    return route.fulfill({
      body: wav.subarray(start, end + 1),
      contentType: 'audio/wav',
      status: range ? 206 : 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {})
      }
    })
  })
  await page.route('**/api/v1/admin/**/signed-url', (route) =>
    route.fulfill({ json: { url: '/c02/audio.wav', expires_at: '2026-10-01T23:00:00Z' } })
  )
})

test('绑定后立即装载整段音频，采集当前起止并保持暂停位置', async ({ page, adminApi }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=audio')
  const audio = page.locator('audio').first()
  await expect(audio).toHaveAttribute('src', '/c02/audio.wav')
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).readyState))
    .toBe(4)
  await audio.evaluate((element) => {
    ;(element as HTMLAudioElement).currentTime = 0.5
  })
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBe(0.5)
  await page.getByRole('button', { name: '调整边界' }).first().click()
  await page.getByRole('spinbutton', { name: '开始毫秒', exact: true }).fill('500')
  await expect(page.getByRole('spinbutton', { name: '开始毫秒', exact: true })).toHaveValue('500')
  await audio.evaluate((element) => {
    ;(element as HTMLAudioElement).currentTime = 1.5
  })
  await page.getByRole('spinbutton', { name: '结束毫秒', exact: true }).fill('1500')
  await expect(page.getByRole('spinbutton', { name: '结束毫秒', exact: true })).toHaveValue('1500')
  await page.getByRole('button', { name: '播放整段音频', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停整段音频', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '暂停整段音频', exact: true }).click()
  const paused = await audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
  await page.getByRole('button', { name: '继续播放整段音频', exact: true }).click()
  expect(
    await audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
  ).toBeGreaterThanOrEqual(paused)
  await page.getByRole('button', { name: '暂停整段音频', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({
    content: {
      dialogue: [
        {
          id: 'SENTENCE-1',
          start_ms: 500,
          end_ms: 1500,
          timing_confirmed: false,
          audio_version_id: null
        }
      ]
    }
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('历史分页可选择旧完整版本创建候选，不直接发布', async ({ page, adminApi }) => {
  await page.route('**/api/v1/admin/content/scenes/SCENE-1/revisions?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'REV-OLD',
            version_no: 1,
            edit_version: 4,
            status: 'SUPERSEDED',
            source_revision_id: null,
            title_en: 'Old whole version',
            created_at: '2026-09-01T00:00:00Z',
            created_by: 'admin',
            is_current: false
          }
        ],
        page: 1,
        page_size: 20,
        total: 25
      }
    })
  )
  let copiedSource = ''
  await page.route('**/api/v1/admin/content/scenes/SCENE-1/revisions', async (route) => {
    copiedSource = (route.request().postDataJSON() as { source_revision_id: string })
      .source_revision_id
    await route.fulfill({
      status: 201,
      json: {
        id: 'REV-DRAFT-1',
        scene_id: 'SCENE-1',
        source_revision_id: 'REV-OLD',
        version: 1,
        status: 'DRAFT',
        stable_sentence_ids: ['SENTENCE-1'],
        stable_entry_ids: ['ENTRY-1'],
        content: { title_en: 'Old whole version' },
        created_by: 'admin',
        created_at: null
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  await page.getByRole('button', { name: '完整版本历史', exact: true }).first().click()
  await expect(page.getByText('Old whole version', { exact: true })).toBeVisible()
  await expect(page.getByText('共 25 条', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '创建回退候选' }).click()
  await page.getByRole('button', { name: '创建候选', exact: true }).click()
  await expect(page).toHaveURL(/REV-DRAFT-1\/publish$/)
  expect(copiedSource).toBe('REV-OLD')
  expect(
    adminApi.findRequest('POST', '/api/v1/admin/content/revisions/REV-DRAFT-1/commands/publish')
  ).toBeUndefined()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('批量队列逐文件匹配并显式移出未匹配项', async ({ page, adminApi }) => {
  await page.route('**/api/v1/admin/media/audio-targets?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'TARGET-1',
            stable_key: 'stable-a',
            target_type: 'vocabulary',
            active_version_id: null
          },
          { id: 'TARGET-2', stable_key: 'stable-b', target_type: 'chunk', active_version_id: null }
        ]
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/audio')
  await page.locator('input[type=file]').setInputFiles(
    ['stable-a', 'stable-b', 'unknown'].map((name) => ({
      name: `${name}.wav`,
      mimeType: 'audio/wav',
      buffer: Buffer.from('test')
    }))
  )
  const items = page.locator('.upload-item')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('stable-a · vocabulary')
  await expect(items.nth(1)).toContainText('stable-b · chunk')
  await expect(items.nth(2).getByText('未匹配，请选择稳定目标', { exact: true })).toBeVisible()
  await items.nth(2).getByRole('button', { name: '移出队列' }).click()
  await expect(items).toHaveCount(2)
  expect(adminApi.findRequest('POST', '/api/v1/admin/media/uploads/confirm')).toBeUndefined()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('词卡预览展示当前固定版本的来源原句且发音可空', async ({ page, adminApi }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  const sentence = await page.getByRole('textbox', { name: '英文句子 1', exact: true }).inputValue()
  await page.getByRole('button', { name: '设备预览', exact: true }).click()
  await page.locator('.entry-card').first().click()
  const card = page.getByRole('dialog', { name: '词卡', exact: true })
  await expect(card.getByText('来源原句', { exact: true })).toBeVisible()
  await expect(card.locator('p').filter({ hasText: sentence })).toBeVisible()
  await expect(card.getByText('暂无独立发音', { exact: true })).toBeVisible()
  expect(
    adminApi.findRequest('POST', '/api/v1/admin/content/revisions/REV-DRAFT-1/commands/publish')
  ).toBeUndefined()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('新词条首次登记后保留发音列表，人工确认才绑定且处理期间禁止保存草稿', async ({ page }) => {
  let releaseVersions!: () => void
  const versionsReady = new Promise<void>((resolve) => {
    releaseVersions = resolve
  })
  let targetKey = ''
  let confirmed = false
  await page.route('**/api/v1/admin/content/lexicon', async (route) => {
    const body = route.request().postDataJSON() as { entry: object }
    await route.fulfill({ json: { ...body.entry, entry_id: 'WORD-NEW', entry_version: 1 } })
  })
  await page.route('**/api/v1/admin/media/audio-targets', async (route) => {
    targetKey = (route.request().postDataJSON() as { stable_key: string }).stable_key
    await route.fulfill({
      json: {
        id: 'WORD-TARGET',
        stable_key: targetKey,
        target_type: 'vocabulary',
        active_version_id: null
      }
    })
  })
  await page.route('**/api/v1/admin/media/audio-targets/WORD-TARGET/versions', async (route) => {
    await versionsReady
    await route.fulfill({
      json: {
        items: [
          {
            id: 'WORD-VERSION',
            target_id: 'WORD-TARGET',
            asset_id: 'WORD-ASSET',
            version_no: 1,
            source: 'MANUAL',
            status: confirmed ? 'ACTIVE' : 'CANDIDATE',
            created_at: null,
            created_by: 'admin',
            provider_request_id: null,
            processing_job_id: null
          }
        ]
      }
    })
  })
  await page.route(
    '**/api/v1/admin/media/audio-versions/WORD-VERSION/commands/confirm',
    async (route) => {
      confirmed = true
      await route.fulfill({
        json: {
          id: 'WORD-TARGET',
          stable_key: targetKey,
          target_type: 'vocabulary',
          active_version_id: 'WORD-VERSION'
        }
      })
    }
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  await page.getByRole('button', { name: '添加词汇', exact: true }).click()
  const entry = page.locator('.entry-row').nth(1)
  await entry.getByRole('textbox', { name: 'vocabulary 英文 2', exact: true }).fill('hello')
  await entry.getByRole('button', { name: '创建／加载独立发音目标' }).click()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled()
  await expect(entry.getByRole('button', { name: '删除条目' })).toBeDisabled()
  releaseVersions()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
  expect(targetKey).toBe('WORD-NEW')
  await entry.locator('.lexicon-media-fields .el-select').click()
  await page.getByRole('option', { name: 'v1 · CANDIDATE', exact: true }).click()
  await expect(entry.getByRole('textbox', { name: '独立发音版本编号（可空）' })).toHaveValue('')
  expect(confirmed).toBe(false)
  await entry.getByRole('button', { name: '确认并绑定所选发音' }).click()
  await expect(entry.getByRole('textbox', { name: '独立发音版本编号（可空）' })).toHaveValue(
    'WORD-VERSION'
  )
  await expect(entry.getByRole('textbox', { name: '独立发音目标编号（可空）' })).toHaveValue(
    'WORD-TARGET'
  )
  expect(confirmed).toBe(true)
})

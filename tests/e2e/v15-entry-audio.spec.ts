import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, scene } from './fixtures/content-work-orders'

for (const role of ['vocabulary', 'chunk'] as const) {
  test(`现代${role}上传固定发音只绑定本篇稳定条目，不沿用旧合成确认`, async ({
    adminApi,
    page
  }) => {
    const entry = {
      ...scene.vocabulary[0]!,
      confirmed: true,
      pronunciation_target_id: 'OLD-TTS',
      sense_id: 'saved-sense',
      source_id: 'saved-source'
    }
    const content = {
      ...structuredClone(scene),
      vocabulary: role === 'vocabulary' ? [entry] : [],
      chunks: role === 'chunk' ? [entry] : []
    }
    const requests = await mockWorkOrder(page, { template: 'dialogue', content })
    const targets: Record<string, unknown>[] = []
    let uploaded = false
    const version = {
      id: 'NEW-VERSION',
      target_id: 'NEW-TARGET',
      asset_id: 'NEW-ASSET',
      status: 'CANDIDATE',
      version_no: 1,
      source: 'UPLOAD',
      created_at: '2026-10-14T00:00:00Z'
    }
    await page.route('**/api/v1/admin/media/audio-targets', (route) => {
      targets.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          id: 'NEW-TARGET',
          stable_key: entry.entry_id,
          target_type: role,
          active_version_id: null
        }
      })
    })
    await page.route('**/api/v1/admin/media/audio-targets/NEW-TARGET/versions', (route) => {
      if (route.request().method() === 'POST') {
        uploaded = true
        return route.fulfill({ json: version })
      }
      return route.fulfill({ json: { items: uploaded ? [version] : [] } })
    })
    await page.route('**/api/v1/admin/media/upload-policies', (route) =>
      route.fulfill({ json: { upload_url: '/__entry-upload', fields: { key: 'entry/test.wav' } } })
    )
    await page.route('**/__entry-upload', (route) => route.fulfill({ status: 204 }))
    await page.route('**/api/v1/admin/media/uploads/confirm', (route) =>
      route.fulfill({ json: { id: 'NEW-ASSET', status: 'CONFIRMED' } })
    )
    await page.route('**/api/v1/admin/media/audio-versions/NEW-VERSION/commands/confirm', (route) =>
      route.fulfill({
        json: {
          id: 'NEW-TARGET',
          stable_key: entry.entry_id,
          target_type: role,
          active_version_id: 'NEW-VERSION'
        }
      })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order/items/one?section=entries')
    const area = page.locator('.lexicon-fields').nth(role === 'vocabulary' ? 0 : 1)
    await area.locator('input[type=file][accept*="mp3"]').setInputFiles({
      name: 'voice.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('controlled upload transport fixture')
    })
    await expect(
      area.getByRole('button', { name: '确认并绑定所选发音', exact: true })
    ).toBeEnabled()
    expect(targets).toEqual([{ stable_key: entry.entry_id, target_type: role }])
    expect(requests.some((request) => request.path.endsWith('/correction'))).toBe(false)
    await area.getByRole('button', { name: '确认并绑定所选发音', exact: true }).click()
    await expect(area.getByText('本篇义项已确认', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '保存候选资料', exact: true }).click()
    await expect
      .poll(() => requests.filter((request) => request.path.endsWith('/correction')).length)
      .toBe(1)
    const saved = requests.find((request) => request.path.endsWith('/correction'))!.body
      .current as {
      content: { vocabulary: Record<string, unknown>[]; chunks: Record<string, unknown>[] }
    }
    expect(
      (role === 'vocabulary' ? saved.content.vocabulary : saved.content.chunks)[0]
    ).toMatchObject({
      entry_id: entry.entry_id,
      sense_id: 'saved-sense',
      source_id: 'saved-source',
      audio_target_id: 'NEW-TARGET',
      audio_version_id: 'NEW-VERSION',
      pronunciation_target_id: null,
      confirmed: false
    })
    expect(entry.pronunciation_target_id).toBe('OLD-TTS')
    expect(
      adminApi.requests.some((request) => request.pathname.endsWith('/commands/generate'))
    ).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

for (const delayed of ['upload', 'signed-url'] as const) {
  test(`现代词条A的${delayed}迟到不覆盖同词不同义的B`, async ({ adminApi, page }) => {
    await mockWorkOrder(page, { template: 'dialogue', content: scene })
    const version = {
      id: 'A-VERSION',
      target_id: 'A-TARGET',
      asset_id: 'A-ASSET',
      status: 'CONFIRMED',
      version_no: 1,
      source: 'UPLOAD',
      created_at: '2026-10-14T00:00:00Z'
    }
    const b = {
      ...structuredClone(scene),
      vocabulary: [
        {
          ...scene.vocabulary[0]!,
          entry_id: 'other-entry',
          chinese: '另一含义',
          audio_target_id: null,
          audio_version_id: null
        }
      ]
    }
    await page.route('**/work-orders/order/items/two', (route) =>
      route.fulfill({
        json: {
          ...item,
          item_id: 'two',
          content_id: 'SCENE-B',
          revision_id: 'B-REV',
          candidate_hash: 'b'.repeat(64),
          current: { template: 'dialogue', content: b }
        }
      })
    )
    await page.route('**/api/v1/admin/media/audio-targets', (route) =>
      route.fulfill({
        json: {
          id: 'A-TARGET',
          stable_key: scene.vocabulary[0]!.entry_id,
          target_type: 'vocabulary',
          active_version_id: null
        }
      })
    )
    let release!: () => void
    let held = false
    await page.route('**/api/v1/admin/media/audio-targets/A-TARGET/versions', async (route) => {
      if (delayed === 'upload' && route.request().method() === 'POST') {
        held = true
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return route.fulfill({ json: version })
      }
      return route.fulfill({ json: { items: [version] } })
    })
    await page.route('**/api/v1/admin/media/assets/A-ASSET/signed-url', async (route) => {
      held = true
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return route.fulfill({ json: { url: '/__late-a.wav' } })
    })
    await page.route('**/api/v1/admin/media/upload-policies', (route) =>
      route.fulfill({ json: { upload_url: '/__entry-upload', fields: { key: 'entry/test.wav' } } })
    )
    await page.route('**/__entry-upload', (route) => route.fulfill({ status: 204 }))
    await page.route('**/api/v1/admin/media/uploads/confirm', (route) =>
      route.fulfill({ json: { id: 'A-ASSET', status: 'CONFIRMED' } })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order/items/one?section=entries')
    const a = page.locator('.lexicon-fields').first()
    if (delayed === 'upload')
      await a.locator('input[type=file][accept*="mp3"]').setInputFiles({
        name: 'voice.wav',
        mimeType: 'audio/wav',
        buffer: Buffer.from('controlled transport fixture')
      })
    else {
      await a.getByRole('button', { name: '创建／加载独立发音目标', exact: true }).click()
      await a.getByRole('combobox').last().press('Enter')
      await page.getByRole('option', { name: 'v1 · CONFIRMED', exact: true }).click()
      await a.getByRole('button', { name: '试听发音', exact: true }).click()
    }
    await expect.poll(() => held).toBe(true)
    await navigateInApp(page, '/content/work-orders/order/items/two?section=entries')
    await expect(page.locator('.lexicon-fields').first()).toContainText('另一含义')
    const response = page.waitForResponse((result) =>
      result.url().includes(delayed === 'upload' ? '/A-TARGET/versions' : '/A-ASSET/signed-url')
    )
    release()
    await response
    const current = page.locator('.lexicon-fields').first()
    await expect(
      current.getByRole('button', { name: '确认并绑定所选发音', exact: true })
    ).toBeDisabled()
    await expect(current.locator('audio')).not.toHaveAttribute('src', /late-a/)
    expect(
      adminApi.requests.some((request) => request.pathname.endsWith('/commands/generate'))
    ).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

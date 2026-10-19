import { readFileSync, rmSync, writeFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const root = process.env.JUYA_IMPORT_VERIFY_DIR || ''
const credentials = root ? JSON.parse(readFileSync(`${root}/credentials.json`, 'utf8')) : {}
test.skip(!root, 'Requires an isolated verification API with a held action worker')

for (const action of ['offline', 'delete'] as const) {
  test(`list updates after closing a still-running ${action} result`, async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('管理员账号').fill(credentials.username)
    await page.getByLabel('密码', { exact: true }).fill(credentials.password)
    await page.getByRole('button', { name: '登录后台' }).click()
    await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
    const session = await (await page.request.get('/api/admin/v1/auth/session')).json()
    /** 为每个真实写请求生成独立幂等键
     * @returns 当前会话及本次操作的请求头
     */
    const headers = () => ({
      'X-CSRF-Token': session.csrf_token,
      'Idempotency-Key': crypto.randomUUID()
    })
    const name = `自动刷新验收-${action}-${Date.now()}`
    const content = {
      name,
      title_en: 'Ordering Coffee',
      image_id: null as string | null,
      audio_id: null as string | null,
      dialogue: [{ id: 'line', speaker: 'A', english: 'Hello coffee.', chinese: '你好，咖啡。' }],
      vocabulary: [{ id: 'word', english: 'coffee', meaning: '咖啡' }],
      chunks: []
    }
    if (action === 'offline') {
      for (const [kind, file] of [
        ['image', 'scene.png'],
        ['audio', 'dialogue.wav']
      ] as const) {
        const response = await page.request.post(`/api/admin/v1/media?kind=${kind}`, {
          headers: headers(),
          multipart: {
            file: {
              name: file,
              mimeType: kind === 'image' ? 'image/png' : 'audio/wav',
              buffer: readFileSync(`${root}/${file}`)
            }
          }
        })
        expect(response.ok()).toBe(true)
        const media = await response.json()
        await expect
          .poll(
            async () =>
              (await (await page.request.get(`/api/admin/v1/media/${media.id}/status`)).json())
                .state
          )
          .toBe('ready')
        content[kind === 'image' ? 'image_id' : 'audio_id'] = media.id
      }
    }
    const response = await page.request.post('/api/admin/v1/cards', {
      headers: headers(),
      data: { content }
    })
    expect(response.ok()).toBe(true)
    const card = await response.json()
    if (action === 'offline') {
      const preview = await (
        await page.request.post(`/api/admin/v1/cards/${card.id}/preview`, {
          headers: headers(),
          data: { revision: card.draft_revision }
        })
      ).json()
      const published = await page.request.post(`/api/admin/v1/cards/${card.id}/publish`, {
        headers: headers(),
        data: { revision: card.draft_revision, preview_id: preview.preview_id }
      })
      expect(published.ok()).toBe(true)
    }
    await page.goto(`/cards?search=${encodeURIComponent(name)}`)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.getByLabel('选择本页卡片').check()
    await page
      .getByRole('button', { name: action === 'offline' ? '批量下线' : '批量删除', exact: true })
      .click()
    writeFileSync(`${root}/hold-actions`, '')
    try {
      await page
        .getByRole('button', {
          name: action === 'offline' ? '确认下线1张' : '确认删除1张',
          exact: true
        })
        .click()
      await expect(page.getByRole('dialog')).toContainText('处理中 1 张')
      await page.getByRole('button', { name: '关闭结果', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      rmSync(`${root}/hold-actions`)
      if (action === 'offline') await expect(page.locator('tbody tr')).toContainText('已下线')
      else await expect(page.locator('tbody tr')).toHaveCount(0)
      await page.screenshot({
        animations: 'disabled',
        path: `test-results/action-refresh-${action}.png`
      })
    } finally {
      rmSync(`${root}/hold-actions`, { force: true })
    }
  })
}

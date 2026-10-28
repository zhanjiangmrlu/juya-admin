import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type {
  Article,
  ImportBatch,
  ImportResult
} from '../../src/features/listening/listening-types'

const statePath = process.env.JUYA_REVISION17_STATE || ''
const fixturePath = process.env.JUYA_REVISION17_FIXTURE || ''
const zipPath = process.env.JUYA_REVISION17_UPDATE_ZIP || ''
const audioPath = process.env.JUYA_REVISION17_AUDIO || ''
test.skip(
  !statePath || !fixturePath || !zipPath || !audioPath,
  'Requires explicitly supplied local-only fixtures'
)
test.use({ storageState: statePath || undefined })

test('stages and confirms an update to one published article without changing its publication or creating another article', async ({
  page,
  baseURL
}, info) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await page.goto('/listening')
  const auth = await (await page.request.get('/api/admin/v1/auth/session')).json()
  /**
   * Send one real local administrator write with a stable operation identity
   * @param path Listening resource path within the local administrator API
   * @param method Explicit write method for this fixture setup
   * @param body Fixed fixture data submitted for this operation
   * @returns The actual confirmed response from the local API
   */
  const write = async <T>(path: string, method: string, body: unknown): Promise<T> => {
    const response = await page.request.fetch(`/api/admin/v1/listening${path}`, {
      method,
      headers: { 'X-CSRF-Token': auth.csrf_token, 'Idempotency-Key': randomUUID() },
      data: body
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const source = await (
    await page.request.get(`/api/admin/v1/listening/articles/${fixture.article_id}`)
  ).json()
  let target = await write<Article>('/articles', 'POST', {
    topic_id: fixture.topic_id,
    payload: {}
  })
  const upload = await page.request.post(
    `/api/admin/v1/listening/articles/${target.id}/media?kind=audio`,
    {
      headers: { 'X-CSRF-Token': auth.csrf_token, 'Idempotency-Key': randomUUID() },
      multipart: {
        file: {
          name: 'local-recording.mp3',
          mimeType: 'audio/mpeg',
          buffer: readFileSync(audioPath)
        }
      }
    }
  )
  expect(upload.ok()).toBe(true)
  const medium = await upload.json()
  expect(medium.state).toBe('ready')
  const title = `导入更新目标${Date.now()}`
  target = await write<Article>(`/articles/${target.id}`, 'PUT', {
    revision: target.revision,
    topic_id: target.topic_id,
    payload: {
      ...source.payload,
      title_zh: title,
      body_en: 'This is the original published article.',
      audio_id: medium.id,
      image_id: null,
      word_meanings: []
    }
  })
  const publishPreview = await write<{ preview_token: string; errors: string[] }>(
    `/articles/${target.id}/preview`,
    'POST',
    { revision: target.revision }
  )
  expect(publishPreview.errors).toEqual([])
  target = await write<Article>(`/articles/${target.id}/publish`, 'POST', {
    revision: target.revision,
    preview_token: publishPreview.preview_token
  })
  const beforeCount = (await (await page.request.get('/api/admin/v1/listening/articles')).json())
    .total
  await page.goto('/listening-imports')
  await expect(page.locator('input[type="file"]')).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles(zipPath)
  await expect(page.getByRole('heading', { name: '核对本批文章', exact: true })).toBeVisible()
  await expect(page.locator('.candidate')).toHaveCount(1)
  await page.getByRole('button', { name: '核对 / 补充资料', exact: true }).click()
  await page.getByLabel('更新已有文章', { exact: true }).check()
  await page.getByRole('textbox', { name: '查找已有文章', exact: true }).fill(title)
  await page.getByRole('button', { name: '搜索目标', exact: true }).click()
  await page.getByRole('button', { name: `选择《${title}》`, exact: true }).click()
  await page.locator('.candidate-editor .content-form select').selectOption(fixture.topic_id)
  await page.getByRole('combobox', { name: '完整音频对应', exact: true }).selectOption(medium.id)
  await expect(page.locator('.target-difference')).toContainText(
    'This is the original published article.'
  )
  await expect(page.locator('.target-difference')).toContainText('We rest.')
  const staged = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().includes('/candidates/')
  )
  await page.getByRole('button', { name: '保存到本批暂存', exact: true }).click()
  const batch = (await (await staged).json()) as ImportBatch
  expect(batch.candidates[0]!.target_article_id).toBe(target.id)
  expect(batch.candidates[0]!.target_revision).toBe(target.revision)
  const stagedAudio = await page.request.get(
    `/api/admin/v1/listening/imports/${batch.id}/media/${medium.id}`
  )
  expect(stagedAudio.status()).toBe(200)
  expect(stagedAudio.headers()['content-type']).toContain('audio/')
  expect(
    await (await page.request.get(`/api/admin/v1/listening/articles/${target.id}`)).json()
  ).toMatchObject({ revision: target.revision, payload: { title_zh: title } })
  await page.reload()
  await expect(page.locator('.candidate')).toContainText(target.id)
  await page.getByRole('button', { name: '核对 / 补充资料', exact: true }).click()
  await expect(page.locator('.selected-target')).toContainText(title)
  await expect(page.getByRole('combobox', { name: '完整音频对应', exact: true })).toHaveValue(
    medium.id
  )
  await page.getByRole('button', { name: '放弃本次修改', exact: true }).click()
  await page.getByRole('button', { name: '核对完成，下一步', exact: true }).click()
  await expect(page.locator('.final-changes')).toContainText('更新已有文章')
  await expect(page.locator('.final-changes')).toContainText(
    'This is the original published article.'
  )
  await expect(page.locator('.final-changes')).toContainText('We rest.')
  expect(
    (await (await page.request.get(`/api/admin/v1/listening/articles/${target.id}`)).json())
      .revision
  ).toBe(target.revision)
  await page.screenshot({ path: info.outputPath('update-confirmation-1440.png'), fullPage: true })
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith(`/imports/${batch.id}/save`)
  )
  await page.getByRole('button', { name: '确认保存草稿', exact: true }).click()
  const response = await saved
  const result = (await response.json()) as ImportResult
  expect(result.items).toEqual([
    expect.objectContaining({ status: 'success', article_id: target.id })
  ])
  const after = await (
    await page.request.get(`/api/admin/v1/listening/articles/${target.id}`)
  ).json()
  expect(after.revision).toBe(target.revision + 1)
  expect(after.version_id).toBe(target.version_id)
  expect(after.payload.title_zh).not.toBe(title)
  expect(after.payload.audio_id).toBe(medium.id)
  expect((await (await page.request.get('/api/admin/v1/listening/articles')).json()).total).toBe(
    beforeCount
  )
  const batchArticles = await (
    await page.request.get(`/api/admin/v1/listening/articles?batch_id=${batch.id}`)
  ).json()
  expect(batchArticles.items.map((item: { id: string }) => item.id)).toEqual([target.id])
  const summary = await (
    await page.request.get(
      `http://127.0.0.1:8002/api/mini/v1/listening/articles/${target.id}/summary`,
      { headers: { Authorization: `Bearer ${fixture.access_token}` } }
    )
  ).json()
  expect(summary.title_zh).toBe(title)
  expect(summary.version_id).toBe(target.version_id)
  const replay = await page.request.post(response.url(), {
    headers: {
      'X-CSRF-Token': auth.csrf_token,
      'Idempotency-Key': response.request().headers()['idempotency-key']!
    },
    data: response.request().postDataJSON()
  })
  expect(await replay.json()).toEqual(result)
  expect(
    (await (await page.request.get(`/api/admin/v1/listening/articles/${target.id}`)).json())
      .revision
  ).toBe(after.revision)
  await expect(page.getByRole('heading', { name: '本次保存结果', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('update-result-1440.png'), fullPage: true })
})

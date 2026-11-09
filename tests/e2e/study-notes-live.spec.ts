import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
const root = process.env.JUYA_STUDY_NOTES_FIXTURE || ''
const fixture = root ? JSON.parse(readFileSync(join(root, 'credentials.json'), 'utf8')) : {}
test.skip(!root, 'Requires isolated study-note API/worker fixtures')

test('real PDF replacement and removal publish independently of the body version', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(fixture.username)
  await page.getByLabel('密码', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto(`/cards/${fixture.cardId}`)
  const note = page.locator('.study-note')
  await expect(note).toContainText('学习笔记.pdf')
  await page.getByLabel('选择学习笔记PDF').setInputFiles(join(root, 'replacement.pdf'))
  await expect(note.locator('.file-card')).toContainText('replacement.pdf', { timeout: 20000 })
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.editor-actions')).toContainText('草稿已保存')
  const publishedBefore = await (
    await page.request.get(`/api/admin/v1/cards/${fixture.cardId}/published`)
  ).json()
  expect(publishedBefore.study_note.media_id).toBe(fixture.originalNoteId)
  await page.getByRole('button', { name: '预览并发布' }).click()
  await page.getByRole('button', { name: '查看学习笔记', exact: true }).click()
  await expect(page.getByTitle('学习笔记PDF', { exact: true })).toHaveAttribute('src', /^blob:/)
  await page.screenshot({ path: 'test-results/study-note-live-pdf-preview.png', fullPage: true })
  await page
    .getByRole('dialog', { name: '学习笔记PDF · 管理员只读预览' })
    .getByRole('button', { name: 'Close this dialog' })
    .click()
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/cards(?:\?|$)/)
  const published = await (
    await page.request.get(`/api/admin/v1/cards/${fixture.cardId}/published`)
  ).json()
  expect(published.version_id).toBe(fixture.versionId)
  expect(published.study_note.filename).toBe('replacement.pdf')
  await page.goto(`/cards/${fixture.cardId}`)
  await page.getByLabel('选择学习笔记PDF').setInputFiles(join(root, 'broken.pdf'))
  await expect(note).toContainText('校验失败', { timeout: 20000 })
  await expect(note.locator('.file-card')).toContainText('replacement.pdf')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByRole('button', { name: '预览并发布' }).click()
  await expect(page.locator('.editor-page')).toContainText('学习笔记尚未就绪')
  await page.screenshot({
    path: 'test-results/study-note-live-failed-replacement.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '取消本次更换／保留原笔记' }).click()
  await note.getByRole('button', { name: '移除', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const beforeRemove = await (
    await page.request.get(`/api/admin/v1/cards/${fixture.cardId}/published`)
  ).json()
  expect(beforeRemove.study_note.media_id).toBe(published.study_note.media_id)
  await page.getByRole('button', { name: '预览并发布' }).click()
  await expect(page.getByRole('button', { name: '查看学习笔记', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page).toHaveURL(/\/cards(?:\?|$)/)
  const removed = await (
    await page.request.get(`/api/admin/v1/cards/${fixture.cardId}/published`)
  ).json()
  expect(removed.study_note).toBeNull()
  expect(removed.version_id).toBe(fixture.versionId)
  expect(errors).toEqual([])
})

test('ZIP multiple PDF selection, corrupt cancellation and legacy ZIP can save independently', async ({
  page
}) => {
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(fixture.username)
  await page.getByLabel('密码', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto('/imports')
  await page
    .locator('input[type=file][accept=".zip"]')
    .first()
    .setInputFiles(['multiple.zip', 'broken.zip', 'legacy.zip'].map((name) => join(root, name)))
  await page.locator('[data-action="start-upload"]').click()
  await expect(page.getByRole('button', { name: '进入核对', exact: true })).toBeEnabled({
    timeout: 25000
  })
  await page.getByRole('button', { name: '进入核对', exact: true }).click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(3)
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: 'ZIP-multiple' })
    .getByRole('button', { name: '展开核对' })
    .click()
  await expect(page.locator('.study-note')).toContainText('multiple.zip / scene')
  await expect(page.locator('.study-note')).toContainText('请选择一份或不添加')
  await page.locator('.study-note label.el-radio').first().click()
  await expect(page.locator('.study-note .file-card')).toContainText('first.pdf')
  await page.screenshot({ path: 'test-results/study-note-live-zip-selection.png', fullPage: true })
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: 'ZIP-broken' })
    .getByRole('button', { name: '展开核对' })
    .click()
  await page
    .locator('.study-note label.el-radio')
    .filter({ hasText: '不添加学习笔记／移除原笔记' })
    .click()
  await page.locator('[data-action="review-next"]').click()
  await expect(page.locator('[data-action="save-import"]')).toBeEnabled()
  await page.locator('[data-action="save-import"]').click()
  await expect(page.locator('.result-summary')).toContainText('成功 3', { timeout: 25000 })
  await page.screenshot({ path: 'test-results/study-note-live-zip-results.png', fullPage: true })
})
for (const action of ['set', 'unresolved'] as const) {
  test(`legacy ZIP target selection preserves existing draft ${action} and published PDF`, async ({
    page
  }) => {
    const session = await (
      await page.request.post('/api/admin/v1/auth/login', {
        data: { username: fixture.username, password: fixture.password }
      })
    ).json()
    const headers = { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': '' }
    /** 向隔离API提交带独立幂等键的验证准备操作
     * @param path 管理接口内的相对业务路径
     * @param method 当前验证准备操作的方法
     * @param data 当前合成资料请求正文
     * @returns 已确认的服务端结果
     */
    const write = async (path: string, method: string, data: unknown) => {
      const response = await page.request.fetch(`/api/admin/v1${path}`, {
        method,
        data,
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }
      })
      expect(response.ok()).toBe(true)
      return response.json()
    }
    const source = await (await page.request.get(`/api/admin/v1/cards/${fixture.cardId}`)).json()
    let card = await write('/cards', 'POST', {
      content: { ...source.content, name: `旧包目标-${action}-${Date.now()}` },
      study_note: { action: 'set', media_id: fixture.originalNoteId }
    })
    const preview = await write(`/cards/${card.id}/preview`, 'POST', {
      revision: card.draft_revision
    })
    card = await write(`/cards/${card.id}/publish`, 'POST', {
      revision: preview.revision,
      preview_id: preview.preview_id
    })
    const publishedId = card.published_study_note.media_id
    const upload = await page.request.post('/api/admin/v1/media?kind=study_note', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      multipart: {
        file: {
          name: 'B.pdf',
          mimeType: 'application/pdf',
          buffer: readFileSync(join(root, 'replacement.pdf'))
        }
      }
    })
    const medium = await upload.json()
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/admin/v1/media/${medium.id}/status`)).json()).state
      )
      .toBe('ready')
    card = await write(`/cards/${card.id}`, 'PUT', {
      revision: card.draft_revision,
      content: card.content,
      study_note: action === 'set' ? { action, media_id: medium.id } : { action }
    })
    await page.goto('/imports')
    await page
      .locator('input[type=file][accept=".zip"]')
      .first()
      .setInputFiles(join(root, 'legacy.zip'))
    await page.locator('[data-action="start-upload"]').click()
    await expect(page.getByRole('button', { name: '进入核对', exact: true })).toBeEnabled({
      timeout: 25000
    })
    await page.getByRole('button', { name: '进入核对', exact: true }).click()
    await page
      .locator('.review-list tr[data-item-id]')
      .first()
      .getByRole('button', { name: '展开核对' })
      .click()
    await page.getByRole('button', { name: '选择更新目标／核对差异', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '确认更新目标与差异' })
    await dialog.getByLabel('搜索更新目标').fill(card.content.name)
    await dialog.getByRole('button', { name: '查找卡片', exact: true }).click()
    await dialog.getByRole('button', { name: '选择并核对差异', exact: true }).click()
    await dialog.getByRole('checkbox').check()
    const staged = page.waitForResponse(
      (response) => response.request().method() === 'PATCH' && response.url().includes('/items/')
    )
    await dialog.getByRole('button', { name: '确认更新此草稿', exact: true }).click()
    expect((await staged).request().postDataJSON()).not.toHaveProperty('study_note')
    await page.locator('.review-list tr[data-item-id]').first().getByRole('checkbox').check()
    await expect(page.locator('[data-action="review-next"]')).toBeEnabled()
    await page.locator('[data-action="review-next"]').click()
    await page.locator('[data-action="save-import"]').click()
    await expect(page.locator('.result-summary')).toContainText('成功 1', { timeout: 25000 })
    const after = await (await page.request.get(`/api/admin/v1/cards/${card.id}`)).json()
    expect(after.study_note.action).toBe(action)
    if (action === 'set') expect(after.study_note.attachment.id).toBe(medium.id)
    expect(after.published_study_note.media_id).toBe(publishedId)
  })
}
test('ready unsaved B survives saving and reopening a failed C replacement', async ({ page }) => {
  const session = await (
    await page.request.post('/api/admin/v1/auth/login', {
      data: { username: fixture.username, password: fixture.password }
    })
  ).json()
  /** 创建隔离的跨保存验证资料
   * @param path 管理接口内的相对业务路径
   * @param data 合成卡片或预览发布请求正文
   * @returns 已确认的服务端结果
   */
  const write = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/admin/v1${path}`, {
      data,
      headers: { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() }
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const source = await (await page.request.get(`/api/admin/v1/cards/${fixture.cardId}`)).json()
  let card = await write('/cards', {
    content: { ...source.content, name: `跨保存笔记-${Date.now()}` },
    study_note: { action: 'set', media_id: fixture.originalNoteId }
  })
  const preview = await write(`/cards/${card.id}/preview`, { revision: card.draft_revision })
  card = await write(`/cards/${card.id}/publish`, {
    revision: preview.revision,
    preview_id: preview.preview_id
  })
  await page.goto(`/cards/${card.id}`)
  await page.getByLabel('选择学习笔记PDF').setInputFiles(join(root, 'replacement.pdf'))
  await expect(page.locator('.study-note .file-card')).toContainText('replacement.pdf')
  await page.getByLabel('选择学习笔记PDF').setInputFiles(join(root, 'broken.pdf'))
  await expect(page.locator('.study-note')).toContainText('校验失败')
  await expect(page.locator('.study-note .file-card')).toContainText('replacement.pdf')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.editor-actions')).toContainText('草稿已保存')
  await page.reload()
  await expect(page.locator('.study-note .file-card')).toContainText('replacement.pdf')
  let saved = await (await page.request.get(`/api/admin/v1/cards/${card.id}`)).json()
  expect(saved.study_note.pending_attachment.state).toBe('failed')
  const retainedB = saved.study_note.attachment.id
  expect(saved.published_study_note.media_id).toBe(fixture.originalNoteId)
  await page.getByRole('button', { name: '取消本次更换／保留原笔记' }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.editor-actions')).toContainText('草稿已保存')
  saved = await (await page.request.get(`/api/admin/v1/cards/${card.id}`)).json()
  expect(saved.study_note.attachment.id).toBe(retainedB)
  expect(saved.study_note.pending_attachment).toBeNull()
  expect(saved.study_note.can_publish).toBe(true)
  expect(saved.published_study_note.media_id).toBe(fixture.originalNoteId)
  await page
    .locator('.study-note')
    .screenshot({ path: 'test-results/study-note-unsaved-B-retained-after-save.png' })
})

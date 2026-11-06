import { expect, test } from '@playwright/test'

/** 构造隔离的PDF素材处理快照
 * @param id 当前模拟PDF媒体编号
 * @param state 当前模拟校验状态
 * @returns 独立素材响应
 */
const media = (id: string, state = 'ready') => ({
  id,
  kind: 'study_note',
  state,
  content_type: 'application/pdf',
  original_name: `${id}.pdf`,
  size: 100,
  width: null,
  height: null,
  duration: null,
  thumbnail_id: null
})

test('PDF pending draft, failed replacement, cancellation, candidate preview and authenticated Blob', async ({
  page
}) => {
  const writes: { path: string; body: Record<string, unknown> }[] = []
  const old = media('original')
  const content = {
    name: '学习笔记验收',
    title_en: 'Study Notes',
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  const card = {
    id: 'note-card',
    content,
    draft_revision: 1,
    study_note: { action: 'keep', attachment: old, can_publish: true },
    status: 'published',
    issues: []
  }
  let failed = false
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (path === '/api/admin/v1/media/original') {
      await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' })
      return
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON()
      writes.push({ path, body })
      card.draft_revision++
      card.study_note =
        body.study_note?.action === 'set'
          ? ({
              action: 'set',
              attachment: old,
              pending_attachment: media('replacement', failed ? 'failed' : 'processing'),
              can_publish: false
            } as typeof card.study_note)
          : { action: 'keep', attachment: old, can_publish: true }
    }
    const json = path.endsWith('/auth/session')
      ? { id: 'fixture-admin', username: 'fixture', csrf_token: 'fixture-csrf' }
      : path.endsWith('/media/configuration')
        ? { study_note_limit_bytes: 20971520, image_limit_bytes: 1000, audio_limit_bytes: 1000 }
        : path === '/api/admin/v1/media'
          ? media('replacement', 'processing')
          : path.endsWith('/replacement/status')
            ? failed
              ? { ...media('replacement', 'failed'), error: 'PDF损坏' }
              : media('replacement', 'processing')
            : path.endsWith('/preview')
              ? {
                  preview_id: 'preview',
                  revision: card.draft_revision,
                  content,
                  study_note: { action: 'keep', attachment: old, can_publish: true }
                }
              : card
    await route.fulfill({ json })
  })
  await page.goto('/cards/note-card')
  const note = page.locator('.study-note')
  await expect(note).toContainText('original.pdf')
  await page.getByLabel('选择学习笔记PDF').setInputFiles({
    name: 'replacement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF')
  })
  await expect(note).toContainText('正在校验')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]!.body.study_note).toEqual({ action: 'set', media_id: 'replacement' })
  await page.getByRole('button', { name: '预览并发布' }).click()
  await expect(page.locator('.editor-page')).toContainText('学习笔记尚未就绪')
  failed = true
  await expect(note).toContainText('PDF损坏', { timeout: 5000 })
  await expect(note).toContainText('original.pdf')
  await page.screenshot({
    path: 'test-results/study-note-failed-retains-original.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '取消本次更换／保留原笔记' }).click()
  await page.getByRole('button', { name: '预览并发布' }).click()
  await page.getByRole('button', { name: '查看学习笔记', exact: true }).click()
  await expect(page.getByTitle('学习笔记PDF', { exact: true })).toHaveAttribute('src', /^blob:/)
  await page.screenshot({ path: 'test-results/study-note-admin-preview.png', fullPage: true })
  expect(page.url()).not.toContain('/mini/')
})

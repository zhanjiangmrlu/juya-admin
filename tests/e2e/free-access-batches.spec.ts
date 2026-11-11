import { writeFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

import { emptyPayload } from '../../src/features/listening/listening-model'

/** 安装33项跨4页的隔离API，保存全部写请求用于检查未知恢复和失败子集
 * @param page 独立浏览器页面
 * @returns 本轮操作记录
 */
const mockBatches = async (page: Page) => {
  const accepted: { path: string; body: { items: { content_id: string }[] }; key: string }[] = [],
    operations: string[] = []
  let snapshots: Record<string, unknown>[] = [],
    target = true,
    kind = 'scene',
    lost = true,
    outcome: Record<string, unknown> | null = null
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      current = Number(url.searchParams.get('page') || 1)
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'batch-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/preview') && path.includes('/free-access-batches')) {
      const body = request.postDataJSON()
      target = body.is_free
      kind = body.content_type
      snapshots = body.ids.map((id: string) => ({
        content_id: id,
        name: `完整标题${id}`,
        version_id: 'v1',
        free_revision: 1,
        is_free: !target,
        status: ['31', '32'].includes(id) ? 'skipped' : 'pending',
        reason: id === '31' ? 'already_target' : id === '32' ? 'not_published' : null,
        message: id === '31' ? '已是目标状态' : id === '32' ? '当前未有效发布' : null
      }))
      return route.fulfill({
        json: {
          content_type: kind,
          is_free: target,
          total: snapshots.length,
          applicable: snapshots.filter((i) => i.status === 'pending').length,
          skipped: snapshots.filter((i) => i.status === 'skipped').length,
          items: snapshots,
          preview_token: 'frozen'
        }
      })
    }
    if (path.includes('/operations/')) {
      operations.push(path)
      return route.fulfill({ json: { status: 'succeeded', result: outcome } })
    }
    if (path.endsWith('/free-access-batches') || path.endsWith('/retry')) {
      const retry = path.endsWith('/retry'),
        items = snapshots.map((item) => ({
          ...item,
          status:
            item.status === 'skipped'
              ? 'skipped'
              : item.content_id === '30' && !retry
                ? 'failed'
                : 'succeeded',
          reason: item.content_id === '30' && !retry ? 'permission_denied' : item.reason,
          message: item.content_id === '30' && !retry ? '权限变化，请重新核对' : item.message
        }))
      accepted.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()['idempotency-key']!
      })
      outcome = {
        id: retry ? 'retry-task' : 'task',
        job_id: 'job',
        parent_id: retry ? 'task' : null,
        content_type: kind,
        is_free: target,
        state: 'succeeded',
        total: items.length,
        pending: 0,
        succeeded: items.filter((i) => i.status === 'succeeded').length,
        skipped: items.filter((i) => i.status === 'skipped').length,
        failed: items.filter((i) => i.status === 'failed').length,
        items,
        created_at: '2026-11-11T00:00:00Z'
      }
      if (lost) {
        lost = false
        return route.abort('failed')
      }
      return route.fulfill({ json: outcome })
    }
    if (/\/free-access-batches\/[^/]+$/.test(path)) return route.fulfill({ json: outcome })
    if (path.endsWith('/cards') || path.endsWith('/articles')) {
      const items = Array.from({ length: current === 4 ? 3 : 10 }, (_, index) => {
        const id = String((current - 1) * 10 + index),
          title = `标题${id}${index === 0 ? '长标题'.repeat(20) : ''}`
        return path.endsWith('/cards')
          ? {
              id,
              display_name: title,
              display_title_en: 'Published title',
              status: 'published',
              current_version_id: 'v1',
              draft_revision: 1,
              content: { name: title, dialogue: [], vocabulary: [], chunks: [] },
              issues: [],
              is_free: false,
              free_revision: 1,
              updated_at: ''
            }
          : {
              id,
              category_id: 'category',
              status: 'published',
              revision: 1,
              payload: {
                ...emptyPayload(),
                title_zh: title,
                title_en: 'Published title',
                audio_id: 'audio'
              },
              is_free: false,
              free_revision: 1,
              has_unpublished_changes: false,
              word_count: 111,
              created_at: ''
            }
      })
      return route.fulfill({
        json: {
          items,
          total: 33,
          page: current,
          limit: 10,
          total_pages: 4,
          learning_policy: { actual_free_count: outcome ? 30 : 0 }
        }
      })
    }
    return route.fulfill({
      json: path.endsWith('/free-policy')
        ? { article_ids: [], revision: 1 }
        : path.endsWith('/categories')
          ? { items: [{ id: 'category', name: '日常', sort_order: 1, revision: 1 }] }
          : []
    })
  })
  return { accepted, operations }
}

for (const path of ['/cards', '/listening']) {
  test(`${path} accumulates33 across4pages, protects cancelled conditions, queries unknown and retries failures`, async ({
    page
  }) => {
    const writes = await mockBatches(page),
      unit = path === '/cards' ? '张' : '篇'
    await page.goto(path)
    await expect(page.locator('tbody tr')).toHaveCount(10)
    await page.getByRole('button', { name: '批量设置免费', exact: true }).click()
    const selectPage = page.locator('.free-selection-bar .el-checkbox').first()
    for (let p = 1; p <= 4; p++) {
      await selectPage.click()
      await expect(page.locator('.free-selection-bar')).toContainText(
        `已选${Math.min(p * 10, 33)}${unit}（跨${p}页）`
      )
      if (p < 4) await page.getByRole('button', { name: '下一页', exact: true }).click()
    }
    await page.getByRole('button', { name: '上一页', exact: true }).click()
    await expect(page.locator('tbody input:checked')).toHaveCount(10)
    await selectPage.click()
    await expect(page.locator('.free-selection-bar')).toContainText(`已选23${unit}（跨3页）`)
    await selectPage.click()
    await expect(page.locator('.free-selection-bar')).toContainText(`已选33${unit}（跨4页）`)
    const original = page.url()
    await page.locator('.filters input').first().fill('will-cancel')
    await page.locator('.filters button[type="submit"]').click()
    await page.getByRole('button', { name: '保留选择', exact: true }).click()
    await expect(page).toHaveURL(original)
    await expect(page.locator('.filters input').first()).toHaveValue('')
    await expect(page.locator('.free-selection-bar')).toContainText(`已选33${unit}`)
    await page
      .locator('.sidebar a')
      .filter({ hasText: path === '/cards' ? '听读管理' : '场景卡片' })
      .click()
    await page.getByRole('button', { name: '保留选择', exact: true }).click()
    await expect(page).toHaveURL(original)
    await expect(page.locator('.free-selection-bar')).toContainText(`已选33${unit}`)
    await page.getByRole('button', { name: '批量开启免费', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(`本次已选 33${unit}`)
    await expect(dialog.locator('tbody tr')).toHaveCount(33)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes.accepted).toHaveLength(0)
    await page.getByRole('button', { name: '批量开启免费', exact: true }).click()
    await page.getByRole('button', { name: `确认开启31${unit}`, exact: true }).click()
    await expect(dialog).toContainText('查询本次结果')
    await page.getByRole('button', { name: '查询本次结果', exact: true }).click()
    await expect(dialog).toContainText('成功 30 · 跳过 2 · 失败 1')
    expect(writes.operations).toHaveLength(1)
    expect(writes.accepted).toHaveLength(1)
    expect(writes.accepted[0]!.body.items).toHaveLength(31)
    await expect(page.locator('.free-selection-bar')).toContainText(`已选1${unit}`)
    await page.getByRole('button', { name: `仅重试1${unit}失败项`, exact: true }).click()
    await expect(dialog.locator('tbody tr')).toHaveCount(1)
    await page.getByRole('button', { name: `确认开启1${unit}`, exact: true }).click()
    await expect(dialog).toContainText('成功 1 · 跳过 0 · 失败 0')
    expect(writes.accepted).toHaveLength(2)
    expect(writes.accepted[1]!.path).toMatch(/\/task\/retry$/)
    expect(writes.accepted[1]!.body.items.map((i) => i.content_id)).toEqual(['30'])
    await page.getByRole('button', { name: '返回列表', exact: true }).click()
    await expect(page.locator('.free-selection-bar')).toContainText(`已选0${unit}`)
    await page.reload()
    await expect(page.getByRole('dialog')).toContainText('成功 1 · 跳过 0 · 失败 0')
  })
}

for (const width of [1440, 1911]) {
  for (const scale of [1, 1.25]) {
    for (const path of ['/cards', '/listening']) {
      test(`${path} checkbox geometry ${width}px layout${scale * 100}%`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1025 : 837 })
        await mockBatches(page)
        await page.goto(path)
        await expect(page.locator('tbody tr')).toHaveCount(10)
        await page.evaluate((zoom) => {
          document.documentElement.style.zoom = String(zoom)
        }, scale)
        const row = page.locator('tbody tr').first()
        await row.locator('.el-checkbox').click()
        const geometry = await row.locator('.el-checkbox__inner').evaluate((element) => {
          const inner = getComputedStyle(element),
            after = getComputedStyle(element, '::after'),
            hit = getComputedStyle(element.closest('.el-checkbox')!)
          return {
            width: inner.width,
            height: inner.height,
            left: after.left,
            top: after.top,
            hitWidth: hit.width,
            hitHeight: hit.height
          }
        })
        expect(geometry).toMatchObject({
          width: '18px',
          height: '18px',
          hitWidth: '44px',
          hitHeight: '44px'
        })
        expect(Math.abs(Number.parseFloat(geometry.left) - 8)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(Number.parseFloat(geometry.top) - 8)).toBeLessThanOrEqual(0.3)
        await page.screenshot({
          path: `test-results/chg0041-${path.slice(1)}-${width}-${scale * 100}-ordinary.png`
        })
        await page.getByRole('button', { name: '批量设置免费', exact: true }).click()
        await expect(page.locator('tbody input:checked')).toHaveCount(0)
        await row.locator('.el-checkbox').click()
        await expect(page.locator('.free-selection-bar input')).toHaveJSProperty(
          'indeterminate',
          true
        )
        await expect(row.locator('input')).toBeChecked()
        await row.locator('.el-checkbox__inner').evaluate(async (element) => {
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => undefined))
          )
        })
        await page.locator('.free-selection-bar input').focus()
        await page.screenshot({
          path: `test-results/chg0041-${path.slice(1)}-${width}-${scale * 100}-free.png`
        })
        const centers = await page.evaluate(() => {
          /**
           * 根据CSS边框、伪元素盒与变换矩阵计算视觉标记中心，保持屏幕CSS坐标和布局坐标分离
           * @param element 当前可见复选框内框
           * @param pseudo 当前状态对应的勾号或半选线伪元素
           * @returns 屏幕CSS坐标中的框及标记中心、变换与点击区尺寸
           */
          const measure = (element: Element, pseudo: string) => {
            const box = element.getBoundingClientRect(),
              inner = getComputedStyle(element),
              mark = getComputedStyle(element, pseudo)
            const scale = box.width / Number.parseFloat(inner.width),
              matrix = new DOMMatrix(mark.transform)
            const width =
              Number.parseFloat(mark.width) +
              (mark.boxSizing === 'border-box'
                ? 0
                : Number.parseFloat(mark.borderLeftWidth) +
                  Number.parseFloat(mark.borderRightWidth))
            const height =
              Number.parseFloat(mark.height) +
              (mark.boxSizing === 'border-box'
                ? 0
                : Number.parseFloat(mark.borderTopWidth) +
                  Number.parseFloat(mark.borderBottomWidth))
            const x =
              Number.parseFloat(inner.borderLeftWidth) +
              Number.parseFloat(mark.left) +
              Number.parseFloat(mark.marginLeft) +
              width / 2 +
              matrix.e
            const y =
              Number.parseFloat(inner.borderTopWidth) +
              Number.parseFloat(mark.top) +
              Number.parseFloat(mark.marginTop) +
              height / 2 +
              matrix.f
            return {
              boxCenterX: box.x + box.width / 2,
              boxCenterY: box.y + box.height / 2,
              markOffsetX: x * scale - box.width / 2,
              markOffsetY: y * scale - box.height / 2,
              scale,
              boxWidth: box.width,
              hitWidth: element.closest('.el-checkbox')!.getBoundingClientRect().width,
              markTransform: mark.transform,
              markTop: mark.top,
              markHeight: mark.height
            }
          }
          const row = document.querySelector('tbody .is-checked .el-checkbox__inner')!
          const header = document.querySelector('thead .is-indeterminate .el-checkbox__inner')!
          const toolbar = document.querySelector('.free-selection-bar .el-checkbox__inner')!
          const label = document
            .querySelector('.free-selection-bar .el-checkbox__label')!
            .getBoundingClientRect()
          const selected = measure(row, '::after'),
            half = measure(header, '::before'),
            tool = measure(toolbar, '::before')
          return {
            selected,
            half,
            headerRowCenterDelta: half.boxCenterX - selected.boxCenterX,
            toolbarTextCenterDelta: tool.boxCenterY - (label.y + label.height / 2)
          }
        })
        expect(Math.abs(centers.selected.markOffsetX)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(centers.selected.markOffsetY)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(centers.half.markOffsetX)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(centers.half.markOffsetY)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(centers.headerRowCenterDelta)).toBeLessThanOrEqual(0.3)
        expect(Math.abs(centers.toolbarTextCenterDelta)).toBeLessThanOrEqual(0.3)
        writeFileSync(
          `test-results/chg0041-centers-${path.slice(1)}-${width}-${scale * 100}.json`,
          JSON.stringify(centers, null, 2)
        )
        await page.route('**/free-access-batches', async (route) => {
          const body = route.request().postDataJSON()
          await route.fulfill({
            json: {
              id: 'visual-task',
              job_id: 'job',
              parent_id: null,
              content_type: path === '/cards' ? 'scene' : 'listening',
              is_free: true,
              total: 1,
              pending: 1,
              succeeded: 0,
              skipped: 0,
              failed: 0,
              state: 'running',
              created_at: '',
              items: body.items
            }
          })
        })
        await page.route('**/free-access-batches/visual-task', async (route) => {
          await route.fulfill({
            json: {
              id: 'visual-task',
              job_id: 'job',
              parent_id: null,
              content_type: path === '/cards' ? 'scene' : 'listening',
              is_free: true,
              total: 1,
              pending: 1,
              succeeded: 0,
              skipped: 0,
              failed: 0,
              state: 'running',
              created_at: '',
              items: []
            }
          })
        })
        await page.getByRole('button', { name: '批量开启免费', exact: true }).click()
        await page.locator('[data-action="confirm-free"]').click()
        await expect(page.getByRole('dialog')).toContainText('已处理 0/1')
        await page.getByRole('button', { name: '返回列表', exact: true }).click()
        await expect(row.locator('input')).toBeDisabled()
        await page.screenshot({
          path: `test-results/chg0041-${path.slice(1)}-${width}-${scale * 100}-disabled.png`
        })
      })
    }
  }
}

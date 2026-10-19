import { expect, test } from '@playwright/test'

import type { CardView } from '../../src/features/scenes/editor-model'

for (const [shape, width, height] of [
  ['portrait', 1200, 2400],
  ['landscape', 3000, 1000]
] as const) {
  test(`zoomed ${shape} image keeps every edge reachable by scrolling`, async ({ page }) => {
    const card: CardView = {
      id: 'preview-card',
      display_name: '缩放验收',
      display_title_en: '',
      display_thumbnail_id: 'preview-image',
      display_image_id: 'preview-image',
      status: 'published',
      current_version_id: 'v1',
      draft_revision: 1,
      content: { name: '缩放验收', dialogue: [], vocabulary: [], chunks: [] },
      sort_order: 1,
      updated_at: '2026-10-19T00:00:00Z',
      has_unpublished_changes: false,
      issues: []
    }
    await page.route('**/api/admin/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/media/preview-image')) {
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#c8e2b5"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#ad4f32" stroke-width="8"/></svg>`
        })
        return
      }
      const json = path.endsWith('/auth/session')
        ? { id: 'preview-admin', username: 'preview', csrf_token: 'preview-token' }
        : path.endsWith('/cards/preview-card')
          ? card
          : path.endsWith('/cards')
            ? { items: [card], total: 1, page: 1, limit: 10, total_pages: 1 }
            : []
      await route.fulfill({ json })
    })
    await page.goto('/cards')
    await page.addStyleTag({
      content: '* { animation: none !important; transition: none !important; }'
    })
    await page.getByRole('button', { name: '查看 缩放验收 场景大图' }).click()
    const viewport = page.locator('.image-viewport')
    const image = viewport.locator('img')
    await expect(image).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    const initial = await image.boundingBox()
    const frame = await viewport.boundingBox()
    expect(initial!.x).toBeGreaterThanOrEqual(frame!.x)
    expect(initial!.y).toBeGreaterThanOrEqual(frame!.y)
    expect(initial!.x + initial!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1)
    expect(initial!.y + initial!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1)
    for (let step = 0; step < 3; step++)
      await page.getByRole('button', { name: '放大场景图' }).click()
    const enlarged = await image.boundingBox()
    expect(enlarged!.width / initial!.width).toBeCloseTo(1.75, 1)
    // 滚动起点必须能看到左上边缘，终点必须能看到右下边缘
    expect(enlarged!.x).toBeGreaterThanOrEqual(frame!.x - 1)
    expect(enlarged!.y).toBeGreaterThanOrEqual(frame!.y - 1)
    await page.screenshot({ path: `test-results/image-preview-${shape}-175.png` })
    await viewport.hover()
    await page.mouse.wheel(10000, 10000)
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollLeft + element.scrollTop))
      .toBeGreaterThan(0)
    await expect
      .poll(async () => {
        const bounds = await image.boundingBox()
        return Math.max(
          bounds!.x + bounds!.width - frame!.x - frame!.width,
          bounds!.y + bounds!.height - frame!.y - frame!.height
        )
      })
      .toBeLessThanOrEqual(1)
    for (let step = 0; step < 13; step++)
      await page.getByRole('button', { name: '放大场景图' }).click()
    await expect(page.getByRole('button', { name: '放大场景图' })).toBeDisabled()
    expect((await image.boundingBox())!.width / initial!.width).toBeCloseTo(5, 1)
    await viewport.hover()
    await page.mouse.wheel(10000, 10000)
    await expect
      .poll(() =>
        viewport.evaluate(
          (element) =>
            Math.abs(element.scrollWidth - element.clientWidth - element.scrollLeft) +
            Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop)
        )
      )
      .toBeLessThanOrEqual(2)
    const beforeDrag = await viewport.evaluate((element) => ({
      x: element.scrollLeft,
      y: element.scrollTop
    }))
    await page.mouse.move(frame!.x + 100, frame!.y + 100)
    await page.mouse.down()
    await page.mouse.move(frame!.x + 200, frame!.y + 200, { steps: 5 })
    await page.mouse.up()
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(beforeDrag.x - 100, 0)
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBeCloseTo(beforeDrag.y - 100, 0)
    await page.getByRole('button', { name: '恢复原比例' }).click()
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollLeft + element.scrollTop))
      .toBe(0)
    expect((await image.boundingBox())!.width).toBeCloseTo(initial!.width, 0)
    await page.setViewportSize({ width: 1024, height: 720 })
    await expect
      .poll(async () => {
        const bounds = await image.boundingBox()
        const container = await viewport.boundingBox()
        return Math.max(bounds!.width - container!.width, bounds!.height - container!.height)
      })
      .toBeLessThanOrEqual(1)
  })
}

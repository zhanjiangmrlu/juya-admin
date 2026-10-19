import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

const enabled =
  process.env.JUYA_VERIFY_LOCAL_SHARE === '1' &&
  process.env.JUYA_E2E_BASE_URL === 'https://dev-admin.juyayingyu.com'
test.skip(!enabled, 'Explicitly opt in to verify the existing dev-admin local sharing route')

test('public admin domain serves this checkout, preserves authentication and hot-updates without reload', async ({
  page
}) => {
  test.setTimeout(180000)
  const errors: string[] = []
  let connected = false
  let websocketOrigin = ''
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('websocket', (socket) => {
    websocketOrigin = new URL(socket.url()).origin
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') {
        try {
          if (JSON.parse(payload).type === 'connected') connected = true
        } catch {
          // Ignore protocol frames which are not JSON messages
        }
      }
    })
  })
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto('/cards/new')
  await expect(page).toHaveURL(/\/login\?return=/)
  await expect(page.getByRole('heading', { name: '内容管理后台', exact: true })).toBeVisible()
  await expect(page.locator('.app-brand')).toBeVisible()
  const session = await page.request.get('/api/admin/v1/auth/session')
  expect(session.status()).toBe(401)
  expect(session.headers()['x-juya-local-share']).toBeTruthy()
  await expect.poll(() => connected, { timeout: 30000 }).toBe(true)
  expect(websocketOrigin).toBe('wss://dev-admin.juyayingyu.com')
  const before = await page.evaluate(() => performance.timeOrigin)
  const token = `probe-${Date.now()}`
  const property = '--juya-live-share-verification'
  const source = resolve('src/styles/main.scss')
  const block = `\n:root { ${property}: ${token}; }\n`
  try {
    writeFileSync(source, readFileSync(source, 'utf8') + block)
    await expect
      .poll(
        () =>
          page.evaluate(
            (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
            property
          ),
        { timeout: 30000 }
      )
      .toBe(token)
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(before)
  } finally {
    const latest = readFileSync(source, 'utf8')
    if (latest.includes(block)) writeFileSync(source, latest.replace(block, ''))
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
          property
        ),
      { timeout: 30000 }
    )
    .toBe('')
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/local-share-domain-login.png',
    timeout: 90000
  })
  expect(errors).toEqual([])
})

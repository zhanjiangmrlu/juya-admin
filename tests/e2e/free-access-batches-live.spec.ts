import { expect, test } from '@playwright/test'

/** 仅由本轮私有fixture启动的真实SQLite/API/dispatcher/worker联调，不接触现有业务服务 */
test('CHG0041 owned fixture drives real cross-page tasks and revokes an existing media ticket', async ({
  page,
  request
}) => {
  test.skip(
    process.env.JUYA_CHG0041_LIVE !== 'owned-fixture',
    'Requires explicitly started owned fixture'
  )
  test.setTimeout(90000)
  expect((await request.get('http://127.0.0.1:18351/health/ready')).status()).toBe(200)
  expect((await request.get('http://127.0.0.1:18352/health/ready')).status()).toBe(200)
  const sceneList = await (
      await request.get('http://127.0.0.1:18352/api/mini/v1/cards?limit=1')
    ).json(),
    scene = sceneList.items[0]
  const detail = await (
    await request.get(`http://127.0.0.1:18352/api/mini/v1/cards/${scene.id}`)
  ).json()
  const grant = await (
    await request.get(
      `http://127.0.0.1:18352/api/mini/v1/cards/${scene.id}/media/${detail.content.audio_id}/url?version_id=${detail.version_id}`
    )
  ).json()
  const ticket = new URL(grant.url, 'http://127.0.0.1:18352').href
  expect((await request.get(ticket)).status()).toBe(200)
  await page.goto('/login')
  await page.getByLabel('管理员账号', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('correct-test-password')
  await page.getByRole('button', { name: '登录后台', exact: true }).click()
  await expect(page).toHaveURL(/\/cards$/)
  for (const [path, unit, enabled] of [
    ['/cards', '张', false],
    ['/listening', '篇', true]
  ] as const) {
    if (path !== '/cards') await page.goto(path)
    await expect(page.locator('tbody tr')).toHaveCount(10)
    await page.getByRole('button', { name: '批量设置免费', exact: true }).click()
    for (let p = 1; p <= 4; p++) {
      await page.locator('.free-selection-bar .el-checkbox').click()
      await expect(page.locator('.free-selection-bar')).toContainText(
        `已选${Math.min(p * 10, 33)}${unit}`
      )
      if (p < 4) await page.getByRole('button', { name: '下一页', exact: true }).click()
    }
    await page
      .getByRole('button', { name: enabled ? '批量开启免费' : '批量关闭免费', exact: true })
      .click()
    await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(33)
    await page
      .getByRole('button', { name: `确认${enabled ? '开启' : '关闭'}33${unit}`, exact: true })
      .click()
    await expect(page.getByRole('dialog')).toContainText('成功 33 · 跳过 0 · 失败 0', {
      timeout: 20000
    })
    await page.getByRole('button', { name: '返回列表', exact: true }).click()
    await expect(page.locator('.free-selection-bar')).toContainText(`已选0${unit}`)
    await expect(page).toHaveURL(/page=4/)
    if (path === '/cards') {
      expect((await request.get(ticket)).status()).toBe(403)
      expect(
        (await request.get(`http://127.0.0.1:18352/api/mini/v1/cards/${scene.id}`)).status()
      ).toBe(403)
    }
  }
  const policies = await (
    await request.get('http://127.0.0.1:18352/api/mini/v1/privacy/policies')
  ).json()
  expect(policies.analytics_available).toBe(false)
  expect(
    policies.documents.find((document: { kind: string }) => document.kind === 'privacy').version
  ).toBe('chg0041-20261111-v2')
  await page.screenshot({ path: 'test-results/chg0041-live-real-api-worker.png' })
})

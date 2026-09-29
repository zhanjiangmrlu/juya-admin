import { expect, test } from './fixtures/admin-api'

test('campaign fixture rejects unknown routes, methods and invalid commands', async ({
  page,
  adminApi
}) => {
  await page.goto('/login')
  const statuses = await page.evaluate(async () => {
    const requests = [
      ['/api/v1/admin/campaigns/CAMP-1-wrong', 'PUT'],
      ['/api/v1/admin/campaigns/CAMP-1/versions/copy/extra', 'POST'],
      ['/api/v1/admin/campaigns/CAMP-1', 'POST'],
      ['/api/v1/admin/campaigns/CAMP-1/commands/launch', 'POST']
    ]
    return Promise.all(
      requests.map(
        async ([path, method]) =>
          (
            await fetch(path!, {
              method,
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': 'csrf-e2e',
                'X-Idempotency-Key': crypto.randomUUID()
              },
              body: JSON.stringify({ expected_version: 3 })
            })
          ).status
      )
    )
  })
  expect(statuses.every((status) => status >= 400)).toBe(true)
  expect(adminApi.unexpectedRequests).toHaveLength(4)
})

test('campaign fixture validates bodies and optimistic versions without changing state', async ({
  page,
  adminApi
}) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const bodies = [
      {},
      { expected_version: 3 },
      { expected_version: 3, capacity: -1 },
      { expected_version: 3, capacity: 40, extra: true },
      { expected_version: 2, capacity: 40 }
    ]
    const statuses = []
    for (const body of bodies)
      statuses.push(
        (
          await fetch('/api/v1/admin/campaigns/CAMP-1/commands/capacity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': 'csrf-e2e',
              'X-Idempotency-Key': crypto.randomUUID()
            },
            body: JSON.stringify(body)
          })
        ).status
      )
    const invalidSave = await fetch('/api/v1/admin/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-e2e',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: '{}'
    })
    return {
      statuses,
      invalidSave: invalidSave.status,
      detail: await (await fetch('/api/v1/admin/campaigns/CAMP-1')).json()
    }
  })
  expect(result.statuses).toEqual([422, 422, 422, 422, 409])
  expect(result.invalidSave).toBe(422)
  expect(result.detail).toMatchObject({
    version: 3,
    status: 'OPEN',
    current_version: { capacity: 30 }
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('campaign fixture mutates state and copied version identity consistently', async ({
  page,
  adminApi
}) => {
  await page.goto('/login')
  const results = await page.evaluate(async () => {
    const changes = []
    for (const [index, operation] of [
      'pause',
      'resume',
      'end',
      'copy',
      'open',
      'end',
      'archive'
    ].entries()) {
      const path = operation === 'copy' ? 'versions/copy' : `commands/${operation}`
      const response = await fetch(`/api/v1/admin/campaigns/CAMP-1/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-e2e',
          'X-Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({ expected_version: index + 3 })
      })
      changes.push(await response.json())
    }
    return changes
  })
  expect(results.map((item) => item.status)).toEqual([
    'PAUSED',
    'OPEN',
    'ENDED',
    'DRAFT',
    'OPEN',
    'ENDED',
    'ARCHIVED'
  ])
  expect(results.map((item) => item.version)).toEqual([4, 5, 6, 7, 8, 9, 10])
  expect(results[3].current_version).toMatchObject({
    id: 'VERSION-2',
    version_no: 2,
    status: 'DRAFT',
    granted_user_count: 0
  })
  expect(results[6].current_version.status).toBe('ENDED')
  expect(adminApi.unexpectedRequests).toEqual([])
})

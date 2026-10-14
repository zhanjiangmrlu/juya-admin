import { describe, expect, it } from 'vitest'

import { createLimitedEntitlementAdapter } from './limited-entitlement-adapter'

const after = {
  id: null,
  user_id: 'user-1',
  campaign_version_id: 'version-1',
  status: 'PENDING',
  granted_at: '2026-10-14T10:00:00Z',
  start_deadline: '2026-10-21T10:00:00Z',
  activated_at: null,
  expires_at: null,
  remedy_count: 0,
  version: 1
}

describe('limited grant preview adapter', () => {
  it('uses a real read-only preview and binds the grant to the server fingerprint', async () => {
    const calls: unknown[] = []
    const adapter = createLimitedEntitlementAdapter({
      request: async <T>(input: unknown): Promise<T> => {
        calls.push(input)
        return (
          calls.length === 1
            ? {
                before: null,
                after,
                actual_operation: 'GRANT',
                expected_version: 3,
                expected_fingerprint: 'a'.repeat(64),
                previewed_at: after.granted_at,
                campaign_name: '秋季练习',
                duration_days: 3,
                scene_ids: ['scene-1']
              }
            : { ...after, id: 'entitlement-1' }
        ) as T
      }
    })
    const draft = {
      userId: 'user-1',
      campaignVersionId: 'version-1',
      entitlementId: null,
      operation: 'GRANT' as const
    }
    const preview = await adapter.preview!(draft)
    expect(preview.before).toBeNull()
    expect(preview.after.startDeadline).toBe(after.start_deadline)
    expect(preview.after.id).toBeNull()
    expect(preview.campaignName).toBe('秋季练习')
    await adapter.execute(
      { ...draft, expectedFingerprint: preview.expectedFingerprint },
      'same-key'
    )
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/admin/limited-entitlements/preview-grant',
        body: { user_id: 'user-1', campaign_version_id: 'version-1' }
      },
      {
        method: 'POST',
        path: '/api/v1/admin/limited-entitlements/commands/grant',
        body: {
          user_id: 'user-1',
          campaign_version_id: 'version-1',
          expected_fingerprint: 'a'.repeat(64)
        },
        idempotencyKey: 'same-key'
      }
    ])
  })
})

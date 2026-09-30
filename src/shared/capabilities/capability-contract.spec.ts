import { describe, expect, it } from 'vitest'

import { ADMIN_PAGE_DEFINITIONS } from '@/app/admin-navigation'
import { router } from '@/router'

import type { CapabilityKey } from './capability-registry'

import openapi from '../../../openapi/admin-api.json'
import { capabilityRegistry } from './capability-registry'

type Operation = readonly [string, string]
const capabilityRoutes = {
  'analytics.export': [['get', '/api/v1/admin/analytics/export']],
  'analytics.query': [['get', '/api/v1/admin/analytics']],
  'auth.logout': [['post', '/api/v1/admin/session/logout']],
  'auth.password': [['post', '/api/v1/admin/session']],
  'auth.session-probe': [['get', '/api/v1/admin/session']],
  'campaigns.capacity': [['post', '/api/v1/admin/campaigns/{campaign_id}/commands/{operation}']],
  'campaigns.manage': [
    ['get', '/api/v1/admin/campaigns'],
    ['put', '/api/v1/admin/campaigns/{campaign_id}'],
    ['post', '/api/v1/admin/campaigns/{campaign_id}/versions/copy']
  ],
  'contacts.copy-audit': [['post', '/api/v1/admin/users/{user_id}/contact-copy-events']],
  'contacts.correction-command': [
    ['post', '/api/v1/admin/contact-corrections/{correction_id}/commands/{command}']
  ],
  'contacts.correction-list': [
    ['get', '/api/v1/admin/contact-corrections'],
    ['get', '/api/v1/admin/contact-corrections/{correction_id}']
  ],
  'content.batch-jobs': [
    ['get', '/api/v1/admin/media/batch-jobs'],
    ['post', '/api/v1/admin/media/batch-jobs'],
    ['get', '/api/v1/admin/media/trash']
  ],
  'content.discovery-config': [
    ['get', '/api/v1/admin/content/discovery-config'],
    ['put', '/api/v1/admin/content/discovery-config']
  ],
  'content.edit': [
    ['get', '/api/v1/admin/content/revisions/{revision_id}'],
    ['put', '/api/v1/admin/content/revisions/{revision_id}']
  ],
  'content.list': [
    ['get', '/api/v1/admin/content/scenes'],
    ['get', '/api/v1/admin/content/scenes/{scene_id}']
  ],
  'content.ocr': [
    ['post', '/api/v1/admin/media/ocr/jobs'],
    ['get', '/api/v1/admin/media/ocr/jobs/{job_id}/candidate'],
    ['post', '/api/v1/admin/media/ocr/jobs/{job_id}/commands/{operation}'],
    ['get', '/api/v1/admin/media/audio-targets']
  ],
  'content.publish': [['post', '/api/v1/admin/content/revisions/{revision_id}/commands/publish']],
  'content.upload': [
    ['post', '/api/v1/admin/media/upload-policies'],
    ['post', '/api/v1/admin/media/uploads/confirm']
  ],
  'dashboard.read': [['get', '/api/v1/admin/dashboard']],
  'entitlements.formal-command': [
    ['post', '/api/v1/admin/formal-entitlements/commands/{operation}']
  ],
  'entitlements.formal-preview': [['post', '/api/v1/admin/formal-entitlements/preview-operation']],
  'entitlements.limited-command': [['post', '/api/v1/admin/limited-entitlements/commands/grant']],
  'entitlements.list': [
    ['get', '/api/v1/admin/entitlements'],
    ['get', '/api/v1/admin/content-packages']
  ],
  'feedback.command': [['post', '/api/v1/admin/feedback/{ticket_id}/commands/resolve']],
  'feedback.detail': [['get', '/api/v1/admin/feedback/{ticket_id}']],
  'feedback.list': [['get', '/api/v1/admin/feedback']],
  'feedback.screenshot-url': [['post', '/api/v1/admin/feedback/{ticket_id}/screenshot-url']],
  'settings.audit': [['get', '/api/v1/admin/audit-events']],
  'settings.read': [['get', '/api/v1/admin/settings']],
  'settings.update': [['patch', '/api/v1/admin/settings/{key}']],
  'users.detail': [['get', '/api/v1/admin/users/{user_id}']],
  'users.list': [['get', '/api/v1/admin/users']],
  'users.wechat-search': [['post', '/api/v1/admin/users/search-by-wechat']],
  'work-items.list': [['get', '/api/v1/admin/work-items']]
} satisfies Record<CapabilityKey, readonly Operation[]>

describe('six-batch capability acceptance', () => {
  it.each(Object.entries(capabilityRoutes))(
    '%s has documented routes behind its available state',
    (key, operations) => {
      expect(capabilityRegistry[key as CapabilityKey]).toBe('available')
      for (const [method, path] of operations) {
        const operation = (openapi.paths as Record<string, Record<string, unknown>>)[path]?.[method]
        expect(operation, `${method} ${path}`).toBeDefined()
      }
    }
  )

  it('loads a concrete implementation for every A01–A26 route', async () => {
    expect(ADMIN_PAGE_DEFINITIONS).toHaveLength(26)
    for (const item of ADMIN_PAGE_DEFINITIONS) {
      const route = router.getRoutes().find((entry) => entry.name === item.name)
      const loader = route?.components?.default as () => Promise<{ default: { __name: string } }>
      expect(loader, item.name).toBeTypeOf('function')
      const module = await loader()
      expect(module.default.__name, item.name).not.toBe('capability-placeholder-page')
      expect(module.default.__name, item.name).toBeTruthy()
    }
  })
})

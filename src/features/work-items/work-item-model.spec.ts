import { describe, expect, it } from 'vitest'

import type { WorkItemDto } from '@/features/dashboard/dashboard-adapter'

import { groupWorkItems, toWorkItemViewModel } from './work-item-model'

const items: WorkItemDto[] = [
  {
    due_at: '2026-09-29T08:00:00Z',
    key: 'feedback-overdue-1',
    kind: 'FEEDBACK_OVERDUE',
    priority_rank: 10
  },
  {
    due_at: '2026-09-29T09:00:00Z',
    key: 'feedback-supplied-1',
    kind: 'USER_SUPPLIED',
    priority_rank: 20
  },
  {
    due_at: '2026-09-30T08:00:00Z',
    key: 'entitlement-expiring-1',
    kind: 'ACTIVE_ENTITLEMENT_EXPIRING',
    priority_rank: 100
  }
]

describe('work item model', () => {
  it('preserves server priority order while separating informational reminders', () => {
    const grouped = groupWorkItems(items)

    expect(grouped.urgent.map((item) => item.kind)).toEqual(['FEEDBACK_OVERDUE', 'USER_SUPPLIED'])
    expect(grouped.informational[0]?.kind).toBe('ACTIVE_ENTITLEMENT_EXPIRING')
  })

  it('maps work-item kinds to stable labels and destinations', () => {
    expect(toWorkItemViewModel(items[0]!)).toMatchObject({
      actionLabel: '立即处理',
      destination: '/feedback?sla=OVERDUE',
      tone: 'danger'
    })
  })

  it('uses immediate handling and supplied-feedback recheck copy from A01', () => {
    expect(toWorkItemViewModel({ ...items[0]!, kind: 'FEEDBACK_DUE_SOON' }).actionLabel).toBe(
      '立即处理'
    )
    expect(toWorkItemViewModel({ ...items[0]!, kind: 'USER_SUPPLIED' }).actionLabel).toBe(
      '重新查看'
    )
  })

  it.each([
    ['CAMPAIGN_STARTING', '/entitlements?type=LIMITED&status=PENDING'],
    ['CAMPAIGN_START_EXPIRED', '/entitlements?type=LIMITED&status=START_EXPIRED'],
    ['ACTIVE_ENTITLEMENT_EXPIRING', '/entitlements?type=LIMITED&status=ACTIVE'],
    ['NEW_FEEDBACK', '/feedback?status=PENDING'],
    ['USER_SUPPLIED', '/feedback?status=USER_SUPPLIED'],
    ['FEEDBACK_DUE_SOON', '/feedback?sla=DUE_SOON'],
    ['FEEDBACK_OVERDUE', '/feedback?sla=OVERDUE']
  ])('uses API-compatible feedback filters for %s', (kind, destination) => {
    expect(toWorkItemViewModel({ ...items[0]!, kind }).destination).toBe(destination)
  })

  it.each(['constructor', 'toString', '__proto__'])('uses a safe fallback for %s', (kind) => {
    expect(toWorkItemViewModel({ ...items[0]!, kind }).destination).toBe('/work-items')
  })
})

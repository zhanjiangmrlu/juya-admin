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
      actionLabel: '处理',
      destination: '/feedback?sla=OVERDUE',
      tone: 'danger'
    })
  })

  it.each([
    ['NEW_FEEDBACK', '/feedback?status=PENDING'],
    ['USER_SUPPLIED', '/feedback?status=USER_SUPPLIED'],
    ['FEEDBACK_DUE_SOON', '/feedback?sla=DUE_SOON'],
    ['FEEDBACK_OVERDUE', '/feedback?sla=OVERDUE']
  ])('uses API-compatible feedback filters for %s', (kind, destination) => {
    expect(toWorkItemViewModel({ ...items[0]!, kind }).destination).toBe(destination)
  })
})

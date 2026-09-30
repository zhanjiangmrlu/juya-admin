import { describe, expect, it, vi } from 'vitest'

import type { WorkItemAdapter, WorkItemDto } from './work-item-adapter'

import { useWorkItems } from './use-work-items'

describe('work item controller', () => {
  it('keeps completed items removed when an earlier request arrives late', async () => {
    let resolveFirst!: (value: WorkItemDto[]) => void
    const getWorkItems = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue([])
    const controller = useWorkItems({ getWorkItems })
    const first = controller.load()
    await controller.load()
    resolveFirst([
      { due_at: '2026-09-30T01:00:00Z', key: 'feedback:1', kind: 'NEW_FEEDBACK', priority_rank: 60 }
    ])
    await first
    expect(controller.actionable.value).toEqual([])
  })
  it('preserves server order and separates informational reminders', async () => {
    const adapter: WorkItemAdapter = {
      getWorkItems: async () => [
        { due_at: '2026-09-29T01:00:00Z', key: '1', kind: 'FEEDBACK_OVERDUE', priority_rank: 10 },
        { due_at: '2026-09-29T02:00:00Z', key: '2', kind: 'USER_SUPPLIED', priority_rank: 20 },
        { due_at: '2026-09-29T03:00:00Z', key: '3', kind: 'FEEDBACK_DUE_SOON', priority_rank: 30 },
        { due_at: '2026-09-29T04:00:00Z', key: '4', kind: 'CAMPAIGN_STARTING', priority_rank: 40 },
        {
          due_at: '2026-09-29T05:00:00Z',
          key: '5',
          kind: 'CAMPAIGN_START_EXPIRED',
          priority_rank: 50
        },
        { due_at: '2026-09-29T06:00:00Z', key: '6', kind: 'NEW_FEEDBACK', priority_rank: 60 },
        {
          due_at: '2026-09-30T01:00:00Z',
          key: '7',
          kind: 'ACTIVE_ENTITLEMENT_EXPIRING',
          priority_rank: 100
        }
      ]
    }
    const controller = useWorkItems(adapter)

    await controller.load()

    expect(controller.actionable.value.map((item) => item.priority_rank)).toEqual([
      10, 20, 30, 40, 50, 60
    ])
    expect(controller.informational.value[0]?.priority_rank).toBe(100)
  })
})

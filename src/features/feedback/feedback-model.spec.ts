import { describe, expect, it } from 'vitest'

import { formatFeedbackSla, getFeedbackOperations } from './feedback-model'

describe('feedback model', () => {
  it('does not allow a third supplement request', () => {
    expect(
      getFeedbackOperations({
        deadlineAt: '2026-09-30T12:00:00Z',
        status: 'PROCESSING',
        supplementRounds: 2
      })
    ).not.toContain('REQUEST_SUPPLEMENT')
  })

  it('pauses SLA display while waiting for user supplement', () => {
    expect(
      formatFeedbackSla(
        { deadlineAt: '2026-09-29T13:00:00Z', status: 'NEED_MORE', supplementRounds: 1 },
        new Date('2026-09-29T12:00:00Z')
      )
    ).toEqual({ state: 'paused', text: '等待用户补充' })
  })

  it('distinguishes overdue, due-soon and normal SLA windows', () => {
    const now = new Date('2026-09-29T12:00:00Z')
    expect(
      formatFeedbackSla(
        { deadlineAt: '2026-09-29T11:00:00Z', status: 'PROCESSING', supplementRounds: 0 },
        now
      ).state
    ).toBe('overdue')
    expect(
      formatFeedbackSla(
        { deadlineAt: '2026-09-29T18:00:00Z', status: 'PROCESSING', supplementRounds: 0 },
        now
      ).state
    ).toBe('due-soon')
    expect(
      formatFeedbackSla(
        { deadlineAt: '2026-10-01T12:00:00Z', status: 'PROCESSING', supplementRounds: 0 },
        now
      ).state
    ).toBe('normal')
  })
})

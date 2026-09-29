import { describe, expect, it, vi } from 'vitest'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackDetail } from './use-feedback-detail'

describe('feedback detail controller', () => {
  it('loads the real ticket detail by id', async () => {
    const adapter = {
      execute: async () => ticket,
      getDetail: async () => ticket
    } as unknown as FeedbackAdapter
    const controller = useFeedbackDetail(adapter, 'FB-1')
    await controller.load()
    expect(controller.ticket.value?.description).toBe('<b>原样文本</b>')
  })

  it('keeps signed screenshot URLs in memory only and clears them on dispose', async () => {
    const getScreenshotUrl = vi.fn().mockResolvedValue({
      expiresAt: '2026-09-29T08:05:00Z',
      url: 'https://signed.example/one'
    })
    const adapter = {
      execute: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(ticket),
      getScreenshotUrl
    } as unknown as FeedbackAdapter
    const controller = useFeedbackDetail(adapter, 'FB-1')

    await controller.loadScreenshot()
    expect(controller.screenshotUrl.value).toBe('https://signed.example/one')
    expect(getScreenshotUrl).toHaveBeenCalledTimes(1)

    controller.dispose()
    expect(controller.screenshotUrl.value).toBeNull()
  })
})

const ticket = {
  category: 'CONTENT' as const,
  closedAt: null,
  createdAt: '2026-09-29T08:00:00Z',
  deadlineAt: '2026-09-30T08:00:00Z',
  description: '<b>原样文本</b>',
  id: 'FB-1',
  reopenCount: 0,
  resolvedAt: null,
  slaRemainingSeconds: null,
  source: {},
  status: 'PROCESSING' as const,
  supplementRounds: 0,
  updatedAt: '2026-09-29T09:00:00Z',
  userId: 'USER-1',
  internalNotes: [],
  replies: [],
  rounds: [],
  screenshots: [],
  timeline: []
}

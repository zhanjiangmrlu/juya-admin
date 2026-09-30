import { describe, expect, it, vi } from 'vitest'

import { useOcrReview } from './use-ocr-review'

describe('ocr review controller', () => {
  it('loads a candidate and preserves edited JSON when confirmation fails', async () => {
    const adapter = {
      command: vi.fn(),
      confirm: vi.fn().mockRejectedValue(new Error('保存失败')),
      getCandidate: vi.fn(async () => ({
        confidence: 0.9,
        confirmedRevisionId: null,
        content: { title: 'OCR title' },
        id: 'C-1',
        status: 'READY',
        templateType: 'card'
      })),
      getJob: vi.fn(async () => ({
        errorCode: null,
        id: 'JOB-1',
        providerRequestId: 'P-1',
        status: 'SUCCEEDED',
        targetId: 'A-1',
        updatedAt: '2026-09-30T10:00:00Z'
      }))
    }
    const controller = useOcrReview(adapter, 'JOB-1')
    await controller.load()
    controller.setContentText('{"title":"Manual title"}')

    await expect(controller.confirm('SCENE-1')).rejects.toThrow('保存失败')
    await expect(controller.confirm('SCENE-1')).rejects.toThrow('保存失败')
    expect(controller.contentText.value).toContain('Manual title')
    expect(controller.state.value).toBe('error')
    expect(adapter.confirm.mock.calls[0]?.[3]).toBe(adapter.confirm.mock.calls[1]?.[3])
  })

  it('shows a pending task without requesting a candidate and switches to a retried job', async () => {
    const pending = {
      errorCode: null,
      id: 'JOB-1',
      providerRequestId: null,
      status: 'PENDING',
      targetId: 'A-1',
      updatedAt: '2026-09-30T10:00:00Z'
    }
    const retried = { ...pending, id: 'JOB-2' }
    const adapter = {
      command: vi
        .fn()
        .mockResolvedValueOnce(retried)
        .mockResolvedValueOnce({
          ...retried,
          status: 'CANCELLED'
        }),
      confirm: vi.fn(),
      getCandidate: vi.fn(),
      getJob: vi.fn(async () => pending)
    }
    const controller = useOcrReview(adapter, 'JOB-1')

    await controller.load()
    await controller.command('retry')
    await controller.command('cancel')

    expect(controller.activeJobId.value).toBe('JOB-2')
    expect(adapter.getCandidate).not.toHaveBeenCalled()
    expect(adapter.command.mock.calls[1]?.[0]).toBe('JOB-2')
  })
})

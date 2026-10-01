import { describe, expect, it, vi } from 'vitest'

import { useBatchJobs } from './use-batch-jobs'

describe('batch jobs controller', () => {
  it('keeps partial results visible while retrying only failed items', async () => {
    const batch = {
      failureCount: 1,
      id: 'B-1',
      items: [
        {
          attemptCount: 1,
          errorCode: null,
          id: 'I-1',
          resultVersion: 1,
          status: 'SUCCEEDED',
          targetId: 'S-1'
        },
        {
          attemptCount: 1,
          errorCode: 'FAILED',
          id: 'I-2',
          resultVersion: null,
          status: 'FAILED',
          targetId: 'S-2'
        }
      ],
      jobType: 'VALIDATE',
      status: 'COMPLETED_WITH_ERRORS',
      successCount: 1,
      totalCount: 2,
      updatedAt: '2026-09-30T10:00:00Z'
    }
    const adapter = {
      command: vi.fn(async () => batch),
      commandTrash: vi.fn(),
      create: vi.fn(),
      list: vi.fn(async () => ({ items: [batch], page: 1, pageSize: 20, total: 1 })),
      listTrash: vi.fn(async () => []),
      trash: vi.fn()
    }
    const controller = useBatchJobs(adapter)
    await controller.load(2)
    await controller.command('B-1', 'retry-failed')

    expect(controller.jobs.value[0]?.successCount).toBe(1)
    expect(controller.page.value).toBe(2)
    expect(adapter.list).toHaveBeenCalledWith(2, 10)
    expect(adapter.command).toHaveBeenCalledWith('B-1', 'retry-failed', expect.any(String))
  })

  it('reuses the create key after failure, rotates it after success, and de-duplicates results', async () => {
    const batch = {
      failureCount: 0,
      id: 'B-1',
      items: [],
      jobType: 'VALIDATE',
      status: 'PENDING',
      successCount: 0,
      totalCount: 1,
      updatedAt: '2026-09-30T10:00:00Z'
    }
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce(batch)
    const adapter = {
      command: vi.fn(),
      commandTrash: vi.fn(),
      create,
      list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
      listTrash: vi.fn(async () => []),
      trash: vi.fn()
    }
    const controller = useBatchJobs(adapter)

    await expect(controller.create('VALIDATE', ['S-1'])).rejects.toThrow('lost response')
    await controller.create('VALIDATE', ['S-1'])
    await controller.create('VALIDATE', ['S-1'])

    expect(create.mock.calls[0]?.[2]).toBe(create.mock.calls[1]?.[2])
    expect(create.mock.calls[2]?.[2]).not.toBe(create.mock.calls[1]?.[2])
    expect(controller.jobs.value).toHaveLength(1)
    expect(controller.total.value).toBe(1)
  })
})

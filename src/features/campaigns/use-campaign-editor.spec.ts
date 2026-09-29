import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { CampaignAdapter } from './campaign-adapter'

import { useCampaignEditor } from './use-campaign-editor'

const detail = {
  id: 'CAMP-1',
  name: '服务端名称',
  status: 'DRAFT',
  version: 3,
  createdAt: '',
  updatedAt: '',
  currentVersion: null,
  availableOperations: ['open', 'copy', 'capacity']
}

describe('campaign editor', () => {
  it('keeps the admin draft on 409 and shows the latest server version', async () => {
    const adapter = {
      detail: vi
        .fn()
        .mockResolvedValueOnce(detail)
        .mockResolvedValueOnce({ ...detail, name: '其他人修改', version: 4 }),
      save: vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError({ code: 'CONFLICT', message: '版本冲突', requestId: 'req-1', status: 409 })
        )
        .mockResolvedValueOnce({ ...detail, name: '我的修改', version: 5 })
    } as unknown as CampaignAdapter
    const editor = useCampaignEditor(adapter)
    await editor.load('CAMP-1')
    editor.draft.value.name = '我的修改'
    await expect(editor.save()).rejects.toBeInstanceOf(ApiError)
    expect(editor.draft.value.name).toBe('我的修改')
    expect(editor.server.value?.version).toBe(4)
    expect(editor.conflict.value).toBe(true)
    expect(editor.conflictVersion.value).toBe(4)
    await editor.save()
    expect(adapter.save).toHaveBeenCalledTimes(2)
    const firstKey = vi.mocked(adapter.save).mock.calls[0]?.[3]
    const retryKey = vi.mocked(adapter.save).mock.calls[1]?.[3]
    expect(firstKey).toBeTruthy()
    expect(retryKey).not.toBe(firstKey)
    expect(vi.mocked(adapter.save).mock.calls[1]?.[2]).toBe(4)
  })

  it('does not present a cached version as latest when conflict refresh fails', async () => {
    const adapter = {
      detail: vi.fn().mockResolvedValueOnce(detail).mockRejectedValueOnce(new Error('offline')),
      save: vi
        .fn()
        .mockRejectedValue(
          new ApiError({ code: 'CONFLICT', message: '版本冲突', requestId: 'req-2', status: 409 })
        )
    } as unknown as CampaignAdapter
    const editor = useCampaignEditor(adapter)
    await editor.load('CAMP-1')
    editor.draft.value.name = '保留的草稿'
    await expect(editor.save()).rejects.toBeInstanceOf(ApiError)
    expect(editor.draft.value.name).toBe('保留的草稿')
    expect(editor.server.value?.version).toBe(3)
    expect(editor.conflict.value).toBe(true)
    expect(editor.conflictVersion.value).toBeNull()
    expect(editor.error.value).toBe('版本冲突')
  })
})

import { describe, expect, it, vi } from 'vitest'

import { useAudioVersions } from './use-audio-versions'

describe('audio versions controller', () => {
  it('maps all 300 files independently and bounds simultaneous uploads', async () => {
    const targets = Array.from({ length: 300 }, (_, index) => ({
      id: `T-${index}`,
      stableKey: `stable-${index}`,
      targetType: 'vocabulary',
      activeVersionId: null
    }))
    let active = 0
    let maximum = 0
    const adapter = {
      confirmVersion: vi.fn(),
      generate: vi.fn(),
      listTargets: vi.fn(async () => targets),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
      uploadVersion: vi.fn(),
      uploadFile: vi.fn(async (targetId: string) => {
        active++
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        await Promise.resolve()
        active--
        return {
          id: `version-${targetId}`,
          targetId,
          assetId: 'asset',
          versionNo: 1,
          source: 'MANUAL',
          status: 'CANDIDATE',
          createdAt: ''
        }
      })
    }
    const controller = useAudioVersions(adapter, 'scene')
    await controller.load()
    const items = controller.addUploads(
      targets.map((target) => new File(['a'], `${target.stableKey}.wav`))
    )
    expect(items.map((item) => item.targetId)).toEqual(targets.map((target) => target.id))
    expect(() => controller.addUploads([new File(['a'], 'extra.wav')])).toThrow('300')
    await controller.startAllUploads()
    expect(adapter.uploadFile).toHaveBeenCalledTimes(300)
    expect(maximum).toBeLessThanOrEqual(3)
    expect(controller.uploads.value.every((item) => item.status === 'completed')).toBe(true)
  })
  it('loads targets and versions and refreshes after rollback', async () => {
    const target = {
      activeVersionId: 'V-2',
      id: 'T-1',
      stableKey: 'S-1',
      targetType: 'SENTENCE'
    }
    const adapter = {
      confirmVersion: vi.fn(),
      generate: vi.fn(),
      listTargets: vi.fn(async () => [target]),
      listVersions: vi.fn(async () => [
        {
          assetId: 'A-1',
          createdAt: '2026-09-30T10:00:00Z',
          id: 'V-1',
          source: 'MANUAL',
          status: 'SUPERSEDED',
          targetId: 'T-1',
          versionNo: 1
        }
      ]),
      rollback: vi.fn(async () => ({ ...target, activeVersionId: 'V-1' })),
      uploadFile: vi.fn(),
      uploadVersion: vi.fn()
    }
    const controller = useAudioVersions(adapter, 'SCENE-1')
    await controller.load()
    await controller.rollback('V-1')

    expect(controller.selectedTarget.value?.activeVersionId).toBe('V-1')
    expect(adapter.rollback).toHaveBeenCalledWith('T-1', 'V-1', expect.any(String))
    expect(controller.state.value).toBe('success')
  })

  it('isolates audio upload failures and keeps the same key for retry', async () => {
    const target = {
      activeVersionId: null,
      id: 'T-1',
      stableKey: 'S-1',
      targetType: 'SENTENCE'
    }
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce({})
    const adapter = {
      confirmVersion: vi.fn(),
      generate: vi.fn(),
      listTargets: vi.fn(async () => [target]),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
      uploadFile,
      uploadVersion: vi.fn()
    }
    const controller = useAudioVersions(adapter, 'SCENE-1')
    await controller.load()
    const item = controller.addUploads([new File(['a'], 'S-1.mp3', { type: 'audio/mpeg' })])[0]!

    await controller.startUpload(item.id)
    await controller.startUpload(item.id)

    expect(controller.uploads.value[0]?.status).toBe('completed')
    expect(uploadFile.mock.calls[0]?.[2]).toBe(uploadFile.mock.calls[1]?.[2])
  })

  it('freezes the target when a file enters the queue', async () => {
    const first = {
      activeVersionId: null,
      id: 'T-1',
      stableKey: 'S-1',
      targetType: 'SENTENCE'
    }
    const second = { ...first, id: 'T-2', stableKey: 'S-2' }
    const adapter = {
      confirmVersion: vi.fn(),
      generate: vi.fn(),
      listTargets: vi.fn(async () => [first, second]),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
      uploadFile: vi.fn(async () => ({
        assetId: 'A-1',
        createdAt: '2026-09-30T10:00:00Z',
        id: 'V-1',
        source: 'MANUAL',
        status: 'CANDIDATE',
        targetId: 'T-1',
        versionNo: 1
      })),
      uploadVersion: vi.fn()
    }
    const controller = useAudioVersions(adapter, 'SCENE-1')
    await controller.load()
    const item = controller.addUploads([new File(['a'], 'S-1.mp3', { type: 'audio/mpeg' })])[0]!

    await controller.selectTarget('T-2')
    await controller.startUpload(item.id)

    expect(adapter.uploadFile).toHaveBeenCalledWith(
      'T-1',
      expect.any(File),
      expect.any(String),
      expect.any(Function),
      expect.any(AbortSignal)
    )
    expect(controller.selectedTarget.value?.id).toBe('T-2')
    const unmatched = controller.addUploads([new File(['b'], 'unknown.wav')])[0]!
    await controller.startUpload(unmatched.id)
    expect(adapter.uploadFile).toHaveBeenCalledTimes(1)
    expect(controller.uploads.value[1]?.error).toContain('未匹配')
    controller.assignUploadTarget(unmatched.id, 'T-2')
    await controller.startUpload(unmatched.id)
    expect(adapter.uploadFile).toHaveBeenLastCalledWith(
      'T-2',
      expect.any(File),
      expect.any(String),
      expect.any(Function),
      expect.any(AbortSignal)
    )
    const skipped = controller.addUploads([new File(['c'], 'skip.wav')])[0]!
    controller.removeUpload(skipped.id)
    expect(controller.uploads.value.some((candidate) => candidate.id === skipped.id)).toBe(false)
  })

  it('reuses a generation key after failure and rotates it after success', async () => {
    const target = {
      activeVersionId: null,
      id: 'T-1',
      stableKey: 'S-1',
      targetType: 'SENTENCE'
    }
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce('JOB-1')
      .mockResolvedValueOnce('JOB-2')
    const adapter = {
      confirmVersion: vi.fn(),
      generate,
      listTargets: vi.fn(async () => [target]),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
      uploadFile: vi.fn(),
      uploadVersion: vi.fn()
    }
    const controller = useAudioVersions(adapter, 'SCENE-1')
    await controller.load()

    await expect(controller.generate('hello', 'standard')).rejects.toThrow('lost response')
    await controller.generate('hello', 'standard')
    await controller.generate('hello', 'standard')

    expect(generate.mock.calls[0]?.[2]).toBe(generate.mock.calls[1]?.[2])
    expect(generate.mock.calls[2]?.[2]).not.toBe(generate.mock.calls[1]?.[2])
  })
})

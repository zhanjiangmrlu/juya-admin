import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useDiscoveryConfig } from './use-discovery-config'

describe('discovery config controller', () => {
  it('restores the server snapshot and preserves the local draft after conflict', async () => {
    const conflict = new ApiError({
      code: 'DISCOVERY_CONFIG_VERSION_CONFLICT',
      details: { current_version: 4 },
      message: '配置已变化',
      requestId: 'request-409',
      status: 409
    })
    const load = vi.fn().mockResolvedValueOnce(localSnapshot).mockResolvedValueOnce(remoteSnapshot)
    const save = vi.fn().mockRejectedValue(conflict)
    const controller = useDiscoveryConfig({ load, save })

    await controller.load()
    await expect(controller.save(localDraft)).rejects.toBe(conflict)

    expect(save).toHaveBeenCalledWith(localDraft, 3)
    expect(controller.draft.value).toEqual(localDraft)
    expect(controller.conflict.value?.remoteVersion).toBe(4)
    expect(controller.conflict.value?.remote.openSceneIds).toEqual([
      'scene-2',
      'scene-3',
      'scene-4'
    ])
  })
})

const localDraft = {
  learningModules: { grammar: false, scene_learning: true },
  openSceneIds: ['scene-1', 'scene-2', 'scene-3'],
  previewBySeries: { 'series-1': ['scene-4', 'scene-5', 'scene-6'] }
}
const localSnapshot = { ...localDraft, version: 3 }
const remoteSnapshot = {
  ...localSnapshot,
  openSceneIds: ['scene-2', 'scene-3', 'scene-4'],
  version: 4
}

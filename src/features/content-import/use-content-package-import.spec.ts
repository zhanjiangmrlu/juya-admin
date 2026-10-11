import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { ContentPackageAdapter, ImportBatch, ImportPreview } from './content-package-model'

import { useContentPackageImport } from './use-content-package-import'

const batch: ImportBatch = {
  id: 'batch-1',
  status: 'VALIDATED',
  items: [
    {
      id: 'row-1',
      title: 'Coffee',
      contentType: 'dialogue',
      file: 'contents.xlsx',
      sheet: 'content',
      row: 2,
      importId: 'coffee',
      issues: [],
      status: 'READY'
    }
  ],
  unreferencedFiles: [],
  counts: { success: 0, failed: 0, skipped: 0, excluded: 0 }
}
const preview: ImportPreview = {
  version: 'preview-1',
  items: [
    {
      id: 'row-1',
      title: 'Coffee',
      action: 'UPDATE',
      expectedVersion: 3,
      content: { title_en: 'Coffee' },
      previous: { title_en: 'Tea' },
      bindings: [],
      requiredDefaults: ['NO_WORD_IMAGE']
    }
  ]
}
const adapterFactory = (): ContentPackageAdapter => ({
  available: true,
  limits: vi.fn(async () => ({ maxBytes: 1024, maxItems: 1000 })),
  upload: vi.fn(async () => batch),
  load: vi.fn(async () => batch),
  validate: vi.fn(async () => batch),
  preview: vi.fn(async () => preview),
  confirm: vi.fn(async () => ({ ...batch, status: 'COMPLETED' })),
  cancel: vi.fn(async () => batch)
})

describe('content package import', () => {
  it('requires explicit optional defaults and update differences before confirmation', async () => {
    const adapter = adapterFactory()
    const controller = useContentPackageImport(adapter)
    await controller.restore('batch-1')
    await controller.preview()
    controller.selected.value = ['row-1']
    expect(controller.canConfirm.value).toBe(false)
    controller.defaultConfirmations.value = ['row-1:NO_WORD_IMAGE']
    controller.diffConfirmations.value = ['row-1']
    expect(controller.canConfirm.value).toBe(true)
    await controller.confirm()
    expect(adapter.confirm).toHaveBeenCalledWith(
      'batch-1',
      {
        selectedItems: ['row-1'],
        previewVersion: 'preview-1',
        expectedVersions: { 'row-1': 3 },
        defaultConfirmations: ['row-1:NO_WORD_IMAGE'],
        diffConfirmations: ['row-1']
      },
      expect.any(String)
    )
    expect(controller.phase.value).toBe('result')
  })
  it('preserves selected rows on stale preview but requires fresh confirmations', async () => {
    const adapter = adapterFactory()
    const conflict = new ApiError({
      status: 409,
      code: 'IMPORT_PREVIEW_STALE',
      message: '预览已变化',
      requestId: 'req-1'
    })
    vi.mocked(adapter.confirm).mockRejectedValueOnce(conflict)
    const controller = useContentPackageImport(adapter)
    await controller.restore('batch-1')
    await controller.preview()
    controller.selected.value = ['row-1']
    controller.defaultConfirmations.value = ['row-1:NO_WORD_IMAGE']
    controller.diffConfirmations.value = ['row-1']
    await controller.confirm()
    expect(controller.selected.value).toEqual(['row-1'])
    expect(controller.canConfirm.value).toBe(false)
    expect(controller.stale.value).toBe(true)
    expect(adapter.confirm).toHaveBeenCalledTimes(1)
    await controller.preview()
    expect(controller.defaultConfirmations.value).toEqual([])
    expect(controller.diffConfirmations.value).toEqual([])
  })
  it('reuses the same command key after transport failure', async () => {
    const adapter = adapterFactory()
    vi.mocked(adapter.confirm).mockRejectedValueOnce(new Error('network'))
    const controller = useContentPackageImport(adapter)
    await controller.restore('batch-1')
    await controller.preview()
    controller.selected.value = ['row-1']
    controller.defaultConfirmations.value = ['row-1:NO_WORD_IMAGE']
    controller.diffConfirmations.value = ['row-1']
    await controller.confirm()
    await controller.confirm()
    expect(vi.mocked(adapter.confirm).mock.calls[0]?.[2]).toBe(
      vi.mocked(adapter.confirm).mock.calls[1]?.[2]
    )
  })
  it('does not restore an abandoned request after disposal', async () => {
    const adapter = adapterFactory()
    let finish!: (value: ImportBatch) => void
    vi.mocked(adapter.load).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const controller = useContentPackageImport(adapter)
    const pending = controller.restore('batch-1')
    controller.dispose()
    finish(batch)
    await pending
    expect(controller.batch.value).toBeNull()
  })

  it('clears preview and explicit confirmations when another batch is restored', async () => {
    const adapter = adapterFactory()
    const controller = useContentPackageImport(adapter)
    await controller.restore('batch-1')
    await controller.preview()
    controller.selected.value = ['row-1']
    controller.excluded.value = ['bad-row']
    controller.defaultConfirmations.value = ['row-1:NO_WORD_IMAGE']
    controller.diffConfirmations.value = ['row-1']
    vi.mocked(adapter.load).mockResolvedValueOnce({ ...batch, id: 'batch-2' })
    await controller.restore('batch-2')
    expect(controller.previewResult.value).toBeNull()
    expect(controller.selected.value).toEqual([])
    expect(controller.excluded.value).toEqual([])
    expect(controller.defaultConfirmations.value).toEqual([])
    expect(controller.diffConfirmations.value).toEqual([])
    expect(controller.canConfirm.value).toBe(false)
  })
})

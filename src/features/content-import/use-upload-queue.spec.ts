import { describe, expect, it, vi } from 'vitest'

import { useUploadQueue } from './use-upload-queue'

describe('upload queue', () => {
  it('does not confirm a cancelled upload', async () => {
    let releaseUpload: (() => void) | undefined
    const upload = vi.fn(() => new Promise<void>((resolve) => (releaseUpload = resolve)))
    const confirm = vi.fn()
    const controller = useUploadQueue({
      confirm,
      prepare: vi.fn(async () => ({ fields: {}, objectKey: 'uploads/a.png', url: '' })),
      upload
    })
    const item = controller.add(new File(['x'], 'a.png', { type: 'image/png' }), {
      seriesId: 'SERIES-1',
      templateId: 'CARD'
    })
    const running = controller.start(item.id)
    await vi.waitFor(() => expect(upload).toHaveBeenCalled())
    controller.cancel(item.id)
    releaseUpload?.()
    await running

    expect(confirm).not.toHaveBeenCalled()
    expect(item.status).toBe('cancelled')
  })

  it('keeps other files running when one upload fails', async () => {
    const controller = useUploadQueue({
      confirm: vi.fn(async () => undefined),
      prepare: vi.fn(async (file: File) => ({
        fields: {},
        objectKey: `uploads/${file.name}`,
        url: ''
      })),
      upload: vi.fn(async (_prepared, file: File) => {
        if (file.name === 'bad.png') throw new Error('上传失败')
      })
    })
    const context = { seriesId: 'SERIES-1', templateId: 'CARD' }
    controller.add(new File(['x'], 'bad.png', { type: 'image/png' }), context)
    controller.add(new File(['x'], 'good.png', { type: 'image/png' }), context)
    await controller.startAll()
    expect(controller.items.value.map((item) => item.status)).toEqual(['failed', 'awaiting-ocr'])
  })

  it('freezes batch context and reuses the OCR idempotency key after a lost response', async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce({ assetId: 'A-1', jobId: 'J-1' })
    const controller = useUploadQueue({
      confirm,
      prepare: vi.fn(async () => ({ fields: {}, objectKey: 'uploads/a.png', url: '' })),
      upload: vi.fn(async () => undefined)
    })
    const context = { seriesId: 'SERIES-1', templateId: 'CARD' }
    const item = controller.add(new File(['x'], 'a.png', { type: 'image/png' }), context)
    context.seriesId = 'CHANGED'

    await controller.start(item.id)
    await controller.start(item.id)

    expect(confirm.mock.calls[0]?.[1]).toEqual({ seriesId: 'SERIES-1', templateId: 'CARD' })
    expect(confirm.mock.calls[0]?.[2]).toBe(confirm.mock.calls[1]?.[2])
  })
})

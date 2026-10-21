import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import { ApiError } from '@/services/http-client'

import type { ImportBatch } from '@/shared/types/import'

import { useImportStaging } from './use-import-staging'

const batch = {
  id: 'batch',
  mode: 'docx',
  created_at: '',
  files: [],
  unused_file_ids: [],
  items: [
    {
      id: 'one',
      revision: 1,
      content: {
        name: 'Initial',
        title_en: '',
        image_id: null,
        audio_id: null,
        dialogue: [],
        vocabulary: [],
        chunks: []
      },
      selected: true,
      readable: true,
      state: 'incomplete',
      thumbnail_id: null,
      issues: [],
      source_file_id: 'file',
      target_card_id: null,
      target_revision: null,
      saved_card_id: null,
      saved_draft_revision: null,
      suggested_target_id: null,
      job_id: null,
      error_code: null
    }
  ]
} satisfies ImportBatch

it('keeps edits typed while a staging request is in flight and saves them using the next revision', async () => {
  const staging = useImportStaging(() => 'batch')
  staging.merge(batch)
  const entry = staging.entries.one!
  entry.edit.content.name = 'First edit'
  let resolve!: (value: unknown) => void
  request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const first = staging.save(entry)
  entry.edit.content.name = 'Second edit'
  resolve({
    ...batch.items[0],
    revision: 2,
    content: { ...batch.items[0]!.content, name: 'First edit' }
  })
  expect(await first).toBe(true)
  expect(entry.edit.content.name).toBe('Second edit')
  expect(staging.isDirty(entry)).toBe(true)
  request.mockResolvedValueOnce({
    ...batch.items[0],
    revision: 3,
    content: { ...batch.items[0]!.content, name: 'Second edit' }
  })
  expect(await staging.save(entry)).toBe(true)
  expect(request.mock.calls.at(-1)?.[1].body.revision).toBe(2)
  expect(staging.isDirty(entry)).toBe(false)
})

it('recovers the original staging receipt before sending edits made after a lost response', async () => {
  request.mockReset()
  const staging = useImportStaging(() => 'batch')
  staging.merge(batch)
  const entry = staging.entries.one!
  entry.edit.content.name = 'Accepted edit'
  request.mockRejectedValueOnce(new ApiError('network_unknown', '响应待确认'))
  expect(await staging.save(entry)).toBe(false)
  const key = request.mock.calls[0]![1].key
  entry.edit.content.name = 'Later local edit'
  request.mockResolvedValueOnce({
    result: {
      ...batch.items[0],
      revision: 2,
      content: { ...batch.items[0]!.content, name: 'Accepted edit' }
    }
  })
  expect(await staging.save(entry)).toBe(true)
  expect(request.mock.calls[1]![0]).toBe(`/api/admin/v1/operations/${key}`)
  expect(entry.edit.content.name).toBe('Later local edit')
  expect(staging.isDirty(entry)).toBe(true)
})

it('requires target difference confirmation again when the reviewed content changes', async () => {
  request.mockReset()
  const staging = useImportStaging(() => 'batch')
  staging.merge({
    ...batch,
    items: [{ ...batch.items[0]!, target_card_id: 'target', target_revision: 1 }]
  })
  const entry = staging.entries.one!
  entry.edit.content.name = 'Changed after target review'
  expect(await staging.save(entry)).toBe(false)
  expect(request).not.toHaveBeenCalled()
  expect(entry.edit.update_confirmed).toBe(false)
  expect(entry.error).toContain('再次核对更新目标与差异')
})

it('forgets removed dirty entries so flushing cannot resurrect or block the remaining cards', async () => {
  request.mockReset()
  const staging = useImportStaging(() => 'batch')
  staging.merge(batch)
  staging.entries.one!.edit.content.name = 'Discard this local edit'
  staging.merge({ ...batch, items: [] })
  expect(Object.keys(staging.entries)).toEqual([])
  expect(await staging.flush()).toBe(true)
  expect(request).not.toHaveBeenCalled()
})

it('refreshes duplicate status without overwriting unsaved content', async () => {
  const staging = useImportStaging(() => 'batch')
  staging.merge({
    ...batch,
    items: [{ ...batch.items[0]!, state: 'duplicate', suggested_target_id: 'deleted' }]
  })
  const entry = staging.entries.one!
  entry.edit.content.name = 'Keep my unsaved correction'
  staging.merge(batch)
  expect(entry.item.state).toBe('incomplete')
  expect(entry.item.suggested_target_id).toBeNull()
  expect(entry.edit.content.name).toBe('Keep my unsaved correction')
})

it('ignores an older snapshot after an unrelated card was already staged', async () => {
  const staging = useImportStaging(() => 'batch')
  staging.merge({
    ...batch,
    items: [
      {
        ...batch.items[0]!,
        revision: 2,
        content: { ...batch.items[0]!.content, name: 'Already persisted' }
      }
    ]
  })
  staging.merge(batch)
  expect(staging.entries.one!.edit.content.name).toBe('Already persisted')
  expect(staging.entries.one!.item.revision).toBe(2)
})

it('settles an in-flight write before discard without sending later local edits', async () => {
  request.mockReset()
  const staging = useImportStaging(() => 'batch')
  staging.merge(batch)
  const entry = staging.entries.one!
  entry.edit.content.name = 'Already sent'
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const saving = staging.save(entry)
  entry.edit.content.name = 'Discard this later input'
  let settled = false
  const settling = staging.settle(entry).then((result) => {
    settled = result
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  finish({
    ...batch.items[0]!,
    revision: 2,
    content: { ...batch.items[0]!.content, name: 'Already sent' }
  })
  await saving
  await settling
  expect(settled).toBe(true)
  expect(entry.edit.content.name).toBe('Discard this later input')
  expect(request).toHaveBeenCalledTimes(1)
})

it('keeps discard blocked until a previously unknown staging receipt is resolved', async () => {
  request.mockReset()
  const staging = useImportStaging(() => 'batch')
  staging.merge(batch)
  const entry = staging.entries.one!
  entry.edit.content.name = 'Sent before losing connection'
  request.mockRejectedValueOnce(new ApiError('network_unknown', '结果待确认'))
  expect(await staging.save(entry)).toBe(false)
  const operationKey = request.mock.calls[0]![1].key
  entry.edit.content.name = 'Unwanted local changes'
  request.mockRejectedValueOnce(new ApiError('network_unknown', '仍待确认'))
  expect(await staging.settle(entry)).toBe(false)
  request.mockResolvedValueOnce({
    result: {
      ...batch.items[0]!,
      revision: 2,
      content: { ...batch.items[0]!.content, name: 'Sent before losing connection' }
    }
  })
  expect(await staging.settle(entry)).toBe(true)
  expect(request.mock.calls.at(-1)![0]).toBe(`/api/admin/v1/operations/${operationKey}`)
  expect(entry.edit.content.name).toBe('Unwanted local changes')
})

import { expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import {
  freeSelectionQueryKey,
  useCrossPageSelection
} from '@/composables/use-cross-page-selection'

it('keeps 33 stable IDs across four pages and toggles only the visible intersection', () => {
  const rows = ref(Array.from({ length: 10 }, (_, i) => ({ id: String(i) }))),
    page = ref(1)
  const selection = useCrossPageSelection(
    computed(() => rows.value),
    page
  )
  selection.enter()
  for (let p = 1; p <= 4; p++) {
    page.value = p
    rows.value = Array.from({ length: p === 4 ? 3 : 10 }, (_, i) => ({
      id: String((p - 1) * 10 + i)
    }))
    selection.togglePage(true)
  }
  expect(selection.ids.value).toHaveLength(33)
  expect(selection.pageCount.value).toBe(4)
  selection.toggle('30', true)
  expect(selection.ids.value).toHaveLength(33)
  selection.togglePage(false)
  expect(selection.ids.value).toHaveLength(30)
  expect(selection.allSelected.value).toBe(false)
  expect(selection.partialSelected.value).toBe(false)
  page.value = 1
  rows.value = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }))
  expect(selection.allSelected.value).toBe(true)
  selection.toggle('0', false)
  expect(selection.partialSelected.value).toBe(true)
})
it('counts the first page recorded per ID and never restores an unsubmitted selection', () => {
  const rows = ref([{ id: 'same' }]),
    page = ref(1)
  const selection = useCrossPageSelection(rows, page)
  selection.enter()
  selection.toggle('same', true)
  page.value = 9
  selection.toggle('same', true)
  expect(selection.pageCount.value).toBe(1)
  expect(useCrossPageSelection(rows, page).ids.value).toEqual([])
})
it('cancelled changes retain state and confirmed changes clear it', async () => {
  const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const selection = useCrossPageSelection(ref([{ id: 'a' }]), ref(1), confirm)
  selection.enter()
  selection.togglePage(true)
  expect(await selection.discard()).toBe(false)
  expect(selection.ids.value).toEqual(['a'])
  expect(await selection.discard()).toBe(true)
  expect(selection.ids.value).toEqual([])
})
it('excludes pagination but includes every semantic filter in the query key', () => {
  expect(freeSelectionQueryKey('/cards', { page: '1', search: 'x' })).toBe(
    freeSelectionQueryKey('/cards', { page: '4', search: 'x' })
  )
  for (const key of ['search', 'q', 'status', 'category_id', 'batch_id', 'sort']) {
    expect(freeSelectionQueryKey('/cards', { [key]: 'changed' })).not.toBe(
      freeSelectionQueryKey('/cards', {})
    )
  }
  expect(freeSelectionQueryKey('/cards', {})).not.toBe(freeSelectionQueryKey('/listening', {}))
})

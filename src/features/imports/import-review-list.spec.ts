import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { h } from 'vue'

import { blankContent } from '@/features/scenes/editor-model'

import type { ImportEntry } from '@/shared/types/import'

import ImportReviewList from './import-review-list.vue'

/** 创建同名但属于不同来源目录的核对资料
 * @param id 资料的稳定编号及来源目录
 * @returns 可编辑的真实核对数据结构
 */
const entry = (id: string): ImportEntry => {
  const content = { ...blankContent(), name: '同名卡片', title_en: 'A Scene' }
  return {
    item: {
      id,
      content,
      revision: 1,
      selected: true,
      readable: true,
      state: 'ready',
      thumbnail_id: null,
      issues: [],
      source_file_id: id,
      source_zip_id: id,
      source_zip_name: '场景.zip',
      source_folder: id,
      target_card_id: null,
      target_revision: null,
      saved_card_id: null,
      saved_draft_revision: null,
      suggested_target_id: null,
      job_id: null,
      error_code: null
    },
    edit: {
      content,
      selected: true,
      target_card_id: null,
      target_revision: null,
      update_confirmed: false
    },
    baseline: '',
    saving: false,
    error: '',
    conflict: false,
    reviewedContent: ''
  }
}

it('expands one review editor inside its own row without changing the saved selection', async () => {
  const one = entry('first'),
    two = entry('second')
  const page = mount(ImportReviewList, {
    props: { entries: [one, two], activeId: 'first', busy: false, dirtyIds: ['first'] },
    slots: {
      default: ({ entry }: { entry: ImportEntry }) =>
        h('input', { 'aria-label': '编辑核对', value: entry.edit.content.title_en })
    }
  })
  const second = page
    .findAll('tr[data-item-id]')
    .find((row) => row.attributes('data-item-id') === 'second')
  expect(second?.exists()).toBe(true)
  expect(page.findAll('input[aria-label="编辑核对"]')).toHaveLength(1)
  await second!.get('button[aria-expanded]').trigger('click')
  expect(page.emitted('expand')).toEqual([['second']])
  expect(page.emitted('select')).toBeUndefined()
  one.edit.content.title_en = 'Unsaved English!'
  await page.setProps({ activeId: 'second' })
  await page.setProps({ activeId: 'first' })
  expect(page.get('input[aria-label="编辑核对"]').element).toHaveProperty(
    'value',
    'Unsaved English!'
  )
  expect(one.edit.selected).toBe(true)
  expect(page.text()).toContain('first')
  expect(page.text()).toContain('second')
  page.unmount()
})

it('allows duplicate removal independently of its disabled save selection', async () => {
  const entry: ImportEntry = {
    item: {
      id: 'one',
      revision: 1,
      state: 'duplicate',
      readable: true,
      selected: true,
      content: {
        name: '重复卡片',
        title_en: 'Duplicate',
        image_id: null,
        audio_id: null,
        dialogue: [],
        vocabulary: [],
        chunks: []
      },
      thumbnail_id: null,
      issues: [],
      source_file_id: 'source',
      target_card_id: null,
      target_revision: null,
      saved_card_id: null,
      saved_draft_revision: null,
      suggested_target_id: 'old',
      job_id: null,
      error_code: null
    },
    edit: {
      content: {
        name: '重复卡片',
        title_en: 'Duplicate',
        image_id: null,
        audio_id: null,
        dialogue: [],
        vocabulary: [],
        chunks: []
      },
      selected: false,
      target_card_id: null,
      target_revision: null,
      update_confirmed: false
    },
    baseline: '',
    saving: false,
    error: '',
    conflict: false,
    reviewedContent: ''
  }
  const page = mount(ImportReviewList, { props: { entries: [entry], busy: false, dirtyIds: [] } })
  expect(page.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  await page.get('[data-action="manage-removals"]').trigger('click')
  await page.get('input[aria-label="移除 重复卡片"]').setValue(true)
  await page.get('[data-action="remove-selected-items"]').trigger('click')
  expect(page.emitted('remove')?.[0]).toEqual([['one']])
  expect(entry.edit.selected).toBe(false)
  expect(page.emitted('select')).toBeUndefined()
  page.unmount()
})

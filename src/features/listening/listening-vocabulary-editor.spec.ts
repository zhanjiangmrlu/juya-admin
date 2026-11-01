import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import type { VocabularyWord } from './listening-vocabulary-model'

import ListeningVocabularyEditor from './listening-vocabulary-editor.vue'

it('adds independent senses and preserves their identities while reordering and deleting', async () => {
  const page = mount(ListeningVocabularyEditor, { props: { modelValue: [], body: 'He goes.' } })
  await page.get('[data-testid="add-vocabulary"]').trigger('click')
  let value = page.emitted('update:modelValue')!.at(-1)![0] as VocabularyWord[]
  await page.setProps({ modelValue: value })
  await page.get('[data-testid="add-vocabulary"]').trigger('click')
  value = page.emitted('update:modelValue')!.at(-1)![0] as VocabularyWord[]
  await page.setProps({ modelValue: value })
  expect(value).toHaveLength(2)
  await page.findAll('[data-testid="vocabulary-up"]')[1]!.trigger('click')
  const moved = page.emitted('update:modelValue')!.at(-1)![0] as VocabularyWord[]
  expect(moved).toEqual([value[1], value[0]])
  await page.setProps({ modelValue: moved })
  await page.findAll('[data-testid="vocabulary-remove"]')[0]!.trigger('click')
  expect(page.emitted('update:modelValue')!.at(-1)![0]).toEqual([value[0]])
})
it('marks a source stale when the body changes', async () => {
  const page = mount(ListeningVocabularyEditor, {
    props: {
      body: 'He goes.',
      modelValue: [
        {
          id: 'w',
          english: 'go',
          meaning: '走',
          phonetic: '',
          source_hint: '',
          source: {
            start: 0,
            end: 8,
            quote: 'He goes.',
            word_start: 3,
            word_end: 7,
            word: 'goes',
            confirmed: true
          }
        }
      ]
    }
  })
  expect(page.text()).toContain('来源已匹配')
  await page.setProps({ body: 'She goes.' })
  await flushPromises()
  expect(page.text()).toContain('正文已变化')
})

it('retains the DOCX sentence hint while an ambiguous source awaits confirmation', () => {
  const page = mount(ListeningVocabularyEditor, {
    props: {
      body: 'He goes. She goes.',
      modelValue: [
        {
          id: 'w',
          english: 'go',
          meaning: '走',
          phonetic: '',
          source_hint: 'She goes.',
          source: null
        }
      ]
    }
  })
  expect(page.text()).toContain('文档原句待核对：She goes.')
  page.unmount()
})

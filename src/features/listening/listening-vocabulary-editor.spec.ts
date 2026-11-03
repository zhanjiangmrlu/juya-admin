import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
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

it('automatically shows and saves the DOCX sentence and inflected word without manual confirmation', async () => {
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
  await flushPromises()
  expect(page.emitted('update:modelValue')).toBeDefined()
  const matched = page.emitted('update:modelValue')!.at(-1)![0] as VocabularyWord[]
  expect(matched[0]!.source).toEqual({
    start: 9,
    end: 18,
    quote: 'She goes.',
    word_start: 13,
    word_end: 17,
    word: 'goes',
    confirmed: true
  })
  await page.setProps({ modelValue: matched })
  expect(page.text()).toContain('来源已匹配')
  expect(page.find('input[type=checkbox]').exists()).toBe(false)
  expect(page.find('[role=alert]').exists()).toBe(false)
  page.unmount()
})

it('keeps an unmatched original quote visible without inventing offsets or a review checkbox', async () => {
  const page = mount(ListeningVocabularyEditor, {
    props: {
      body: 'She plays.',
      modelValue: [
        {
          id: 'w',
          english: 'go',
          meaning: '去',
          phonetic: '',
          source_hint: 'She goes.',
          source: null
        }
      ]
    }
  })
  await flushPromises()
  expect(page.text()).toContain('文档原句：She goes.')
  expect(page.find('input[type=checkbox]').exists()).toBe(false)
  expect(page.find('[role=alert]').exists()).toBe(true)
  expect(page.emitted('update:modelValue')).toBeUndefined()
  page.unmount()
})

it('lets an unrecognized inflection be selected from the actual sentence without a confirmation step', async () => {
  const value: VocabularyWord[] = [
    {
      id: 'w',
      english: 'swim',
      meaning: '游泳',
      phonetic: '',
      source_hint: 'He swam.',
      source: null
    }
  ]
  const page = mount(ListeningVocabularyEditor, { props: { body: 'He swam.', modelValue: value } })
  page.findAllComponents(ElSelect)[0]!.vm.$emit('change', 0)
  await flushPromises()
  expect(page.findAllComponents(ElSelect)).toHaveLength(2)
  page.findAllComponents(ElSelect)[1]!.vm.$emit('change', 3)
  await flushPromises()
  expect(value[0]!.source).toMatchObject({
    start: 0,
    end: 8,
    word_start: 3,
    word_end: 7,
    word: 'swam'
  })
  expect(page.find('[role=alert]').exists()).toBe(false)
  page.unmount()
})

it('keeps the exact repeated sentence selected by its position', async () => {
  const value: VocabularyWord[] = [
    {
      id: 'w',
      english: 'rest',
      meaning: '休息',
      phonetic: '',
      source_hint: 'We rest.',
      source: null
    }
  ]
  const page = mount(ListeningVocabularyEditor, {
    props: { body: 'We rest. We rest.', modelValue: value }
  })
  await flushPromises()
  const initial = page.emitted('update:modelValue')!.at(-1)![0] as VocabularyWord[]
  await page.setProps({ modelValue: initial })
  page.findAllComponents(ElSelect)[0]!.vm.$emit('change', 9)
  await flushPromises()
  expect(initial[0]!.source).toMatchObject({
    start: 9,
    end: 17,
    word_start: 12,
    word_end: 16,
    word: 'rest'
  })
  page.unmount()
})

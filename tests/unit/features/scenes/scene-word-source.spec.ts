import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import SceneWordSource from '@/features/scenes/scene-word-source.vue'

import type { components } from '@/shared/contracts/generated/admin-api'

it('marks unresolved source visibly and preserves the explicit fragment as manual evidence', async () => {
  const word = {
    id: 'w',
    english: 'cactus',
    meaning: '',
    phonetic: '',
    source_hint: '',
    pronunciation_text: '',
    pronunciation_issue: false,
    source: null,
    source_reason: 'source_unmatched'
  }
  const wrapper = mount(SceneWordSource, {
    props: {
      word,
      dialogue: [{ id: 'line', speaker: 'A', chinese: '仙人掌', english: '😀 We found cacti.' }]
    },
    global: { stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } } }
  })
  expect(wrapper.get('.word-source').classes()).toContain('requires-review')
  expect(wrapper.get('[role="alert"]').text()).toContain('人工')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('在原句中选择片段'))!
    .trigger('click')
  const input = wrapper.get('textarea').element as HTMLTextAreaElement
  input.setSelectionRange(12, 17)
  await wrapper.get('textarea').trigger('select')
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('确认片段'))!
    .trigger('click')
  const source = wrapper.emitted('select')![0]![0] as components['schemas']['Source']
  expect(source).toEqual({
    line_id: 'line',
    start: 12,
    end: 17,
    quote: 'cacti',
    manual_english: 'cactus'
  })
  await wrapper.setProps({ word: { ...word, source, source_reason: null } })
  await flushPromises()
  expect(wrapper.text()).toContain('人工已确认')
  expect(wrapper.text()).not.toContain('自动通过')
  expect(wrapper.get('.word-source').classes()).not.toContain('requires-review')
  wrapper.unmount()
})

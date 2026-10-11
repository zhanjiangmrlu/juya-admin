import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import LexiconFields from './lexicon-fields.vue'
import LexiconMediaFields from './lexicon-media-fields.vue'
import { createLexiconRow } from './scene-form'

it('keeps the media instance when registering a row and does not reuse it for a deleted neighbour', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const rows = [createLexiconRow(), createLexiconRow()]
  const wrapper = mount(LexiconFields, {
    props: { modelValue: rows, entryType: 'vocabulary', sentences: [] },
    global: { plugins: [createPinia(), router, ElementPlus], stubs: { LexiconMediaFields: true } }
  })
  const first = wrapper.findAllComponents(LexiconMediaFields)[0]!
  const second = wrapper.findAllComponents(LexiconMediaFields)[1]!
  first.vm.$emit('update', { ...rows[0], entry_id: 'registered-word' })
  await flushPromises()
  expect(wrapper.findAllComponents(LexiconMediaFields)[0]!.vm === first.vm).toBe(true)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '删除条目')!
    .trigger('click')
  expect(wrapper.findAllComponents(LexiconMediaFields)[0]!.vm === second.vm).toBe(true)
  wrapper.unmount()
})

it('uses per-content registration for modern entries instead of writing the legacy global dictionary', async () => {
  const wrapper = mount(LexiconFields, {
    props: {
      modelValue: [createLexiconRow()],
      entryType: 'vocabulary',
      sentences: [],
      modern: true
    },
    global: { plugins: [createPinia(), ElementPlus], stubs: { LexiconMediaFields: true } }
  })
  expect(wrapper.text()).not.toContain('查询词库')
  expect(wrapper.text()).not.toContain('保存到全局词库')
  expect(wrapper.text()).toContain('保存并确认这篇义项与来源')
  wrapper.unmount()
})

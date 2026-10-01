import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

import LexiconMediaFields from './lexicon-media-fields.vue'
import { createLexiconRow } from './scene-form'

afterEach(() => vi.unstubAllGlobals())

it('creating an optional pronunciation target does not bind an incomplete pronunciation to the draft', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'TARGET-WORD',
          stable_key: 'word',
          target_type: 'vocabulary',
          active_version_id: null
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response('{"items":[]}', { headers: { 'Content-Type': 'application/json' } })
    )
  vi.stubGlobal('fetch', fetch)
  const entry = { ...createLexiconRow(), entry_id: 'word', english: 'hello', chinese: '你好' }
  const pinia = createPinia()
  useAuthStore(pinia).csrfToken = 'test-csrf'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const wrapper = mount(LexiconMediaFields, {
    props: { entry, entryType: 'vocabulary' },
    global: { plugins: [pinia, router, ElementPlus] }
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text().includes('创建／加载独立发音目标'))!
    .trigger('click')
  await flushPromises()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(wrapper.emitted('update')).toBeUndefined()
  expect(entry.audio_target_id).toBeNull()
  expect(entry.audio_version_id).toBeNull()
  wrapper.unmount()
})

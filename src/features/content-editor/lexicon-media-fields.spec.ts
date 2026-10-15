import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

import LexiconMediaFields from './lexicon-media-fields.vue'
import { createLexiconRow, type LexiconRow } from './scene-form'

const versionA = {
  id: 'version-a',
  target_id: 'target-a',
  asset_id: 'asset-a',
  status: 'CANDIDATE',
  version_no: 1,
  source: 'UPLOAD',
  created_at: '2026-10-14T00:00:00Z'
}
/**
 * 装配本篇现代词条的真实组件与认证适配
 * @param entry - 本次当前草稿条目
 * @returns 可操作的媒体组件
 */
const mountModernMedia = async (entry: LexiconRow) => {
  const pinia = createPinia()
  useAuthStore(pinia).csrfToken = 'test-csrf'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  return mount(LexiconMediaFields, {
    props: { entry, entryType: 'vocabulary', modern: true },
    global: { plugins: [pinia, router, ElementPlus] }
  })
}

it.each(['target', 'versions', 'confirm'] as const)(
  '条目A的%s迟到不能给条目B绑定旧发音',
  async (delay) => {
    let release!: (response: Response) => void
    let held = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const path = String(input)
        const json = path.endsWith('/versions')
          ? { items: [versionA] }
          : {
              id: 'target-a',
              stable_key: 'entry-a',
              target_type: 'vocabulary',
              active_version_id: 'version-a'
            }
        if (
          (delay === 'target' && path.endsWith('/audio-targets')) ||
          (delay === 'versions' && path.endsWith('/versions')) ||
          (delay === 'confirm' && path.endsWith('/commands/confirm'))
        ) {
          held = true
          return new Promise<Response>((resolve) => {
            release = () =>
              resolve(
                new Response(JSON.stringify(json), {
                  headers: { 'Content-Type': 'application/json' }
                })
              )
          })
        }
        return new Response(JSON.stringify(json), {
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    const entryA = { ...createLexiconRow(), entry_id: 'entry-a', english: 'bank', chinese: '银行' }
    const wrapper = await mountModernMedia(entryA)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '创建／加载独立发音目标')!
      .trigger('click')
    await flushPromises()
    if (delay === 'confirm') {
      wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'version-a')
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '确认并绑定所选发音')!
        .trigger('click')
      await flushPromises()
    }
    expect(held).toBe(true)
    await wrapper.setProps({
      entry: { ...createLexiconRow(), entry_id: 'entry-b', english: 'bank', chinese: '河岸' }
    })
    release(new Response())
    await flushPromises()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'version-a')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '确认并绑定所选发音')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update')).toBeUndefined()
    wrapper.unmount()
  }
)

it('现代上传版本明确绑定才撤销旧合成引用，未知确认重试复用原body和key', async () => {
  const writes: { key: string | null; body: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const path = String(input)
      if (path.endsWith('/commands/confirm')) {
        writes.push({
          key: new Headers(init?.headers).get('x-idempotency-key'),
          body: String(init?.body)
        })
        if (writes.length === 1) throw new Error('确认响应未知')
      }
      return new Response(
        JSON.stringify(
          path.endsWith('/versions')
            ? { items: [versionA] }
            : {
                id: 'target-a',
                stable_key: 'entry-a',
                target_type: 'vocabulary',
                active_version_id: 'version-a'
              }
        ),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })
  )
  const entry = {
    ...createLexiconRow(),
    entry_id: 'entry-a',
    english: 'bank',
    chinese: '银行',
    confirmed: true,
    pronunciation_target_id: 'old-fixed-tts',
    sense_id: 'sense-a',
    source_id: 'source-a'
  }
  const wrapper = await mountModernMedia(entry)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '创建／加载独立发音目标')!
    .trigger('click')
  await flushPromises()
  wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'version-a')
  await flushPromises()
  const bind = wrapper.findAll('button').find((button) => button.text() === '确认并绑定所选发音')!
  await bind.trigger('click')
  await flushPromises()
  expect(wrapper.emitted('update')).toBeUndefined()
  await bind.trigger('click')
  await flushPromises()
  expect(writes[0]?.key).toBeTruthy()
  expect(writes[1]).toEqual(writes[0])
  expect(wrapper.emitted('update')?.[0]?.[0]).toMatchObject({
    entry_id: 'entry-a',
    sense_id: 'sense-a',
    source_id: 'source-a',
    audio_target_id: 'target-a',
    audio_version_id: 'version-a',
    confirmed: false,
    pronunciation_target_id: null
  })
  expect(entry.pronunciation_target_id).toBe('old-fixed-tts')
  wrapper.unmount()
})

it.each(['vocabulary', 'chunk'] as const)(
  '现代%s使用本篇稳定身份开放可选上传，不先绑定空目标',
  async (entryType) => {
    const requests: { path: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        requests.push({
          path: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null
        })
        return new Response(
          JSON.stringify(
            String(input).endsWith('/versions')
              ? { items: [] }
              : {
                  id: 'fixed-target',
                  target_type: entryType,
                  stable_key: 'local-entry',
                  active_version_id: null
                }
          ),
          { headers: { 'Content-Type': 'application/json' } }
        )
      })
    )
    const entry = {
      ...createLexiconRow(),
      entry_id: 'local-entry',
      english: 'hello',
      chinese: '你好'
    }
    const pinia = createPinia()
    useAuthStore(pinia).csrfToken = 'test-csrf'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    await router.push('/')
    const wrapper = mount(LexiconMediaFields, {
      props: { entry, entryType, modern: true },
      global: { plugins: [pinia, router, ElementPlus] }
    })
    expect(wrapper.findAll('button').some((button) => button.text() === '上传可选独立发音')).toBe(
      true
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '创建／加载独立发音目标')!
      .trigger('click')
    await flushPromises()
    expect(requests[0]).toMatchObject({
      body: { stable_key: 'local-entry', target_type: entryType }
    })
    expect(requests.some((request) => request.path.includes('/lexicon'))).toBe(false)
    expect(wrapper.emitted('update')).toBeUndefined()
    expect(entry.audio_target_id).toBeNull()
    wrapper.unmount()
  }
)

it('现代未保存条目不创建全局词库或无身份的发音目标', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const wrapper = mount(LexiconMediaFields, {
    props: {
      entry: { ...createLexiconRow(), english: 'hello' },
      entryType: 'vocabulary',
      modern: true
    },
    global: { plugins: [createPinia(), router, ElementPlus] }
  })
  const upload = wrapper.findAll('button').find((button) => button.text() === '上传可选独立发音')
  expect(upload).toBeDefined()
  expect(upload!.attributes('disabled')).toBeDefined()
  expect(fetch).not.toHaveBeenCalled()
  wrapper.unmount()
})

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

it('旧条目首次登记得到ID后继续原发音目标操作，不把确权当作跨行切换', async () => {
  const requests: { path: string; body: unknown }[] = []
  const entry = reactive({ ...createLexiconRow(), english: 'hello', chinese: '你好' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const path = String(input)
      requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
      return new Response(
        JSON.stringify(
          path.endsWith('/lexicon')
            ? { ...entry, entry_id: 'registered-word' }
            : path.endsWith('/versions')
              ? { items: [] }
              : {
                  id: 'legacy-target',
                  stable_key: 'registered-word',
                  target_type: 'vocabulary',
                  active_version_id: null
                }
        ),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })
  )
  const pinia = createPinia()
  useAuthStore(pinia).csrfToken = 'test-csrf'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const wrapper = mount(LexiconMediaFields, {
    props: {
      entry,
      entryType: 'vocabulary',
      modern: false,
      onUpdate: (result: LexiconRow) => Object.assign(entry, result)
    },
    global: { plugins: [pinia, router, ElementPlus] }
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '创建／加载独立发音目标')!
    .trigger('click')
  await flushPromises()
  expect(requests).toHaveLength(3)
  expect(requests[1]?.body).toEqual({ stable_key: 'registered-word', target_type: 'vocabulary' })
  expect(entry.entry_id).toBe('registered-word')
  expect(entry.audio_target_id).toBeNull()
  wrapper.unmount()
})

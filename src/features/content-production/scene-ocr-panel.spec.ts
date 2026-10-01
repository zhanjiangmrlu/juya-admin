import { mount } from '@vue/test-utils'
import ElementPlus, { ElDropdown } from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { normalizeSceneContent } from '@/features/content-editor/scene-form'

import SceneOcrPanel from './scene-ocr-panel.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

async function render(overrides: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const form = normalizeSceneContent({
    title_en: 'Manual title',
    title_zh: '人工标题',
    original_image_asset_id: 'image-1'
  })
  const candidate = normalizeSceneContent({})
  const wrapper = mount(SceneOcrPanel, {
    props: {
      form,
      candidate,
      quota: null,
      job: null,
      busy: false,
      disabled: false,
      candidateReady: false,
      suggestions: null,
      acceptedGroups: [],
      rawLines: [],
      imageUrl: '/original.png',
      selectedFields: [],
      ...overrides
    },
    global: { plugins: [createPinia(), router, ElementPlus] }
  })
  wrappers.push(wrapper)
  const button = (label: string) => wrapper.findAll('button').find((item) => item.text() === label)!
  return { wrapper, form, candidate, button }
}

describe('scene OCR panel', () => {
  it('shows the original image and a useful empty state without starting recognition', async () => {
    const { wrapper, button } = await render()
    expect(wrapper.text()).toContain('暂无待校对候选')
    expect(wrapper.text()).toContain('保存并识别原图')
    expect(wrapper.get('img[alt="学习原图"]').attributes('src')).toBe('/original.png')
    expect(wrapper.emitted()).toEqual({})
    expect(wrapper.find('[aria-label="候选英文标题"]').exists()).toBe(false)
    await button('保存并识别原图').trigger('click')
    expect(wrapper.emitted('start')).toEqual([[]])
  })

  it('displays quota and job details and refreshes only when explicitly requested', async () => {
    const { wrapper, button } = await render({
      quota: {
        enabled: false,
        monthly_limit: 80,
        month: '2026-10',
        reserved_count: 80,
        remaining: 0,
        free_quota: 1000,
        paid_disabled: true,
        quota_verified_at: null
      },
      job: {
        id: 'ocr-1',
        status: 'FAILED',
        errorCode: 'LIMIT',
        providerRequestId: 'provider-1',
        targetId: 'scene-1',
        updatedAt: '2026-10-01T12:00:00Z'
      }
    })
    expect(wrapper.text()).toContain('剩余 0 / 80')
    expect(wrapper.text()).toContain('已关闭')
    expect(wrapper.text()).toContain('ocr-1 · FAILED LIMIT')
    expect(wrapper.text()).toContain('provider-1')
    await button('刷新识别状态').trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([[]])
    expect(wrapper.emitted('start')).toBeUndefined()
  })

  it('keeps manual content intact while candidates are edited and fields explicitly selected', async () => {
    const { wrapper, form, candidate, button } = await render({ candidateReady: true })
    await wrapper.get('[aria-label="候选英文标题"]').setValue('OCR corrected title')
    await button('添加句子').trigger('click')
    await wrapper.get('[aria-label="英文句子 1"]').setValue('Candidate sentence')
    expect(candidate.title_en).toBe('OCR corrected title')
    expect(candidate.dialogue[0]?.english).toBe('Candidate sentence')
    expect(form.title_en).toBe('Manual title')
    expect(form.dialogue).toEqual([])
    expect(button('采纳选中字段到当前草稿').attributes('disabled')).toBeDefined()
    await wrapper.get('input[type="checkbox"][value="title_en"]').setValue(true)
    expect(wrapper.emitted('update:selectedFields')).toEqual([[['title_en']]])
    await wrapper.setProps({ selectedFields: ['title_en'] })
    await button('采纳选中字段到当前草稿').trigger('click')
    expect(wrapper.emitted('adopt')).toEqual([[]])
    expect(form.title_en).toBe('Manual title')
  })

  it('offers manual candidate entry when recognition succeeds with no usable lines', async () => {
    const { wrapper } = await render({ candidateReady: true, imageUrl: '' })
    expect(wrapper.text()).toContain('未识别到可用文字')
    expect(wrapper.text()).toContain('手工填写候选')
    expect(wrapper.text()).toContain('暂无可显示的学习原图')
    expect(wrapper.find('[aria-label="候选英文标题"]').exists()).toBe(true)
  })

  it('forwards raw line assignment with the original line index', async () => {
    const { wrapper } = await render({ candidateReady: true, rawLines: ['First', 'Second'] })
    wrapper.findAllComponents(ElDropdown)[1]!.vm.$emit('command', 'vocabulary')
    expect(wrapper.emitted('assign')).toEqual([['Second', 'vocabulary', 1]])
    expect(wrapper.text()).not.toContain('未识别到可用文字')
  })

  it('keeps suggested line identities and disables already accepted groups', async () => {
    const group = { field: 'dialogue', label: '对话', line_ids: [17], reason: '位置建议' }
    const { wrapper, button } = await render({
      candidateReady: true,
      rawLines: ['Fallback must stay hidden'],
      suggestions: {
        template_type: 'dialogue',
        lines: [
          {
            id: 17,
            text: 'Suggested sentence',
            location: { top: 20 },
            confidence: 0.4,
            low_confidence: true,
            paragraph: {}
          }
        ],
        groups: [group],
        unassigned_line_ids: [],
        low_confidence_threshold: 0.7
      }
    })
    expect(wrapper.text()).toContain('低可信／需复核')
    expect(wrapper.text()).not.toContain('Fallback must stay hidden')
    await button('确认分组并加入候选').trigger('click')
    expect(wrapper.emitted('group')).toEqual([[group]])
    wrapper.getComponent(ElDropdown).vm.$emit('command', 'dialogue')
    expect(wrapper.emitted('assign')).toEqual([['Suggested sentence', 'dialogue', 17]])
    await wrapper.setProps({ acceptedGroups: ['dialogue'] })
    expect(button('已加入候选').attributes('disabled')).toBeDefined()
  })

  it.each([{ disabled: true }, { busy: true }])(
    'blocks OCR actions and candidate editing while protected: %j',
    async (protection) => {
      const { wrapper, button } = await render({
        candidateReady: true,
        selectedFields: ['title_en'],
        job: {
          id: 'ocr-1',
          status: 'SUCCEEDED',
          errorCode: null,
          providerRequestId: null,
          targetId: 'scene-1',
          updatedAt: ''
        },
        ...protection
      })
      for (const label of ['保存并识别原图', '刷新识别状态', '采纳选中字段到当前草稿']) {
        expect(button(label).attributes('disabled')).toBeDefined()
        await button(label).trigger('click')
      }
      expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
      expect(wrapper.emitted('start')).toBeUndefined()
      expect(wrapper.emitted('refresh')).toBeUndefined()
      expect(wrapper.emitted('adopt')).toBeUndefined()
    }
  )

  it('blocks recognition without an uploaded original image', async () => {
    const { button } = await render({ form: normalizeSceneContent({}) })
    expect(button('保存并识别原图').attributes('disabled')).toBeDefined()
  })
})

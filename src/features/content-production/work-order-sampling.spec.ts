import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItemDetail } from './work-order-model'

import WorkOrderSampling from './work-order-sampling.vue'
describe('工作单抽样范围', () => {
  it.each(['image', 'audio', 'both'])(
    '词汇卡 %s 媒体必须实际核对，独立发音按固定版本逐个试听',
    async (kind) => {
      const detail = {
        item_id: 'one',
        revision_id: 'revision',
        candidate_hash: 'hash',
        current: {
          template: 'word_card',
          content: {
            vocabulary: [
              {
                english: 'bank',
                icon_asset_id: kind !== 'audio' ? 'image' : null,
                audio_version_id: kind !== 'image' ? 'voice' : null
              }
            ],
            chunks: []
          }
        }
      } as unknown as WorkItemDetail
      const wrapper = mount(WorkOrderSampling, {
        props: {
          state: {
            sample_ids: ['revision'],
            candidates: [{ revision_id: 'revision', candidate_hash: 'hash' }],
            normal_count: 1,
            confirmed_revision_ids: [],
            collection_hash: 'collection'
          } as unknown as S['SamplingState'],
          items: [{ item_id: 'one', revision_id: 'revision' }],
          detail,
          busy: false
        },
        global: { plugins: [ElementPlus], stubs: { ScenePreview: true } }
      })
      await flushPromises()
      const checks = wrapper.findAllComponents({ name: 'ElCheckbox' })
      await checks.find((row) => row.text().includes('已核对完整'))!.setValue(true)
      if (kind !== 'audio') expect(wrapper.text()).toContain('已核对本篇图片')
      if (kind !== 'image') expect(wrapper.text()).toContain('已逐个试听本篇固定发音')
      const confirm = () =>
        wrapper.findAll('button').find((row) => row.text() === '确认已检查本篇')!
      expect(confirm().attributes('disabled')).toBeDefined()
      await wrapper.setProps({
        resources: [
          ...(kind !== 'audio'
            ? [
                {
                  key: 'image',
                  resourceId: 'image',
                  kind: 'image' as const,
                  label: 'bank 图片',
                  url: '/image',
                  identity: 'one:revision:hash'
                }
              ]
            : []),
          ...(kind !== 'image'
            ? [
                {
                  key: 'voice',
                  resourceId: 'voice',
                  kind: 'audio' as const,
                  label: 'bank 发音',
                  url: '/voice',
                  identity: 'one:revision:hash'
                }
              ]
            : [])
        ]
      })
      if (kind !== 'audio')
        await checks.find((row) => row.text().includes('已核对本篇图片'))!.setValue(true)
      if (kind !== 'image') {
        const audioCheck = checks.find((row) => row.text().includes('已逐个试听'))!
        expect(audioCheck.props('disabled')).toBe(true)
        await wrapper.get('audio').trigger('play')
        await audioCheck.setValue(true)
      }
      expect(confirm().attributes('disabled')).toBeUndefined()
      await confirm().trigger('click')
      expect(wrapper.emitted('action')?.[0]?.[0]).toMatchObject({
        images_checked: kind !== 'audio',
        audio_listened: kind !== 'image',
        candidate_hash: 'hash'
      })
    }
  )
  it('全部固定发音均需播放，切换候选后旧播放器事件不构成新试听', async () => {
    const detail = {
      item_id: 'one',
      revision_id: 'revision',
      candidate_hash: 'hash',
      current: {
        template: 'word_card',
        content: {
          vocabulary: [
            { english: 'bank', audio_version_id: 'voice1' },
            { english: 'tea', audio_version_id: 'voice2' }
          ]
        }
      }
    } as unknown as WorkItemDetail
    const state = {
      sample_ids: ['revision'],
      candidates: [{ revision_id: 'revision', candidate_hash: 'hash' }],
      normal_count: 1,
      confirmed_revision_ids: [],
      collection_hash: 'collection'
    } as unknown as S['SamplingState']
    const resources = ['voice1', 'voice2'].map((key) => ({
      key,
      resourceId: key,
      kind: 'audio' as const,
      label: key,
      identity: 'one:revision:hash',
      url: `/${key}`
    }))
    const wrapper = mount(WorkOrderSampling, {
      props: {
        detail,
        state,
        items: [{ item_id: 'one', revision_id: 'revision' }],
        resources,
        busy: false
      },
      global: { plugins: [ElementPlus], stubs: { ScenePreview: true } }
    })
    const check = () =>
      wrapper
        .findAllComponents({ name: 'ElCheckbox' })
        .find((row) => row.text().includes('已逐个试听'))!
    const oldPlayers = wrapper.findAll('audio')
    await oldPlayers[0]!.trigger('play')
    expect(check().props('disabled')).toBe(true)
    await oldPlayers[1]!.trigger('play')
    expect(check().props('disabled')).toBe(false)
    await wrapper.setProps({
      detail: { ...detail, candidate_hash: 'new' },
      state: { ...state, candidates: [{ ...state.candidates[0]!, candidate_hash: 'new' }] },
      resources: resources.map((row) => ({ ...row, identity: 'one:revision:new' }))
    })
    await oldPlayers[0]!.trigger('play')
    await oldPlayers[1]!.trigger('play')
    expect(check().props('disabled')).toBe(true)
  })
  it.each(['hash', 'members', 'set'])('正常范围 %s 改变后必须重新明确同意', async (change) => {
    const state = {
      proofreading_set_id: 'set',
      sample_ids: ['revision'],
      candidates: [{ revision_id: 'revision', candidate_hash: 'a' }],
      normal_count: 1,
      confirmed_revision_ids: ['revision'],
      collection_hash: 'old'
    } as unknown as S['SamplingState']
    const wrapper = mount(WorkOrderSampling, {
      props: { state, items: [], busy: false },
      global: { plugins: [ElementPlus] }
    })
    await wrapper
      .findAllComponents({ name: 'ElCheckbox' })
      .find((row) => row.text().includes('确认其余正常结果'))!
      .setValue(true)
    const button = () => wrapper.findAll('button').find((row) => row.text() === '批量确认正常结果')!
    expect(button().attributes('disabled')).toBeUndefined()
    await wrapper.setProps({
      state: {
        ...state,
        ...(change === 'hash'
          ? { collection_hash: 'new' }
          : change === 'set'
            ? { proofreading_set_id: 'new-set' }
            : { candidates: [{ ...state.candidates[0], candidate_hash: 'new' }] })
      } as S['SamplingState']
    })
    expect(button().attributes('disabled')).toBeDefined()
  })
  it('仅列服务端范围，人工检查未勾选时不能通过，样本数量来自服务端', async () => {
    const state = {
      sample_ids: ['revision'],
      candidates: [
        {
          revision_id: 'revision',
          content_id: 'content',
          content_type: 'short_reading',
          candidate_hash: 'hash',
          normal: true
        }
      ],
      normal_count: 900,
      confirmed_revision_ids: [],
      collection_hash: 'collection'
    } as unknown as S['SamplingState']
    const wrapper = mount(WorkOrderSampling, {
      props: {
        state,
        items: [{ item_id: 'one', revision_id: 'revision', title_en: 'Only member' }],
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('900')
    expect(wrapper.text()).toContain('所需样本 1')
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === '确认已检查本篇')
        ?.attributes('disabled')
    ).toBeDefined()
    expect(wrapper.text()).not.toContain('输入集合编号')
  })
  it('异步成员到达后仍加载当前样本', async () => {
    const wrapper = mount(WorkOrderSampling, {
      props: {
        state: {
          sample_ids: ['revision'],
          candidates: [{ revision_id: 'revision' }],
          normal_count: 1,
          confirmed_revision_ids: [],
          collection_hash: 'hash'
        } as unknown as S['SamplingState'],
        items: [],
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await wrapper.setProps({ items: [{ item_id: 'one', revision_id: 'revision' }] })
    await flushPromises()
    expect(wrapper.emitted('inspect')).toEqual([['one']])
  })
})

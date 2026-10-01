import { mount } from '@vue/test-utils'
import ElementPlus, { ElSelect, ElUpload } from 'element-plus'
import { describe, expect, it } from 'vitest'
import { toRaw } from 'vue'

import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import { createDialogueRow, normalizeSceneContent } from '@/features/content-editor/scene-form'

import type { UploadFile } from 'element-plus'

import SceneAudioPanel from './scene-audio-panel.vue'

function setup(overrides: Partial<InstanceType<typeof SceneAudioPanel>['$props']> = {}) {
  const form = normalizeSceneContent({})
  form.audio = {
    target_id: 'target-1',
    version_id: 'audio-1',
    asset_id: 'asset-1',
    duration_ms: 8000
  }
  form.dialogue = [{ ...createDialogueRow(), start_ms: 100, end_ms: 2000 }]
  return mount(SceneAudioPanel, {
    props: {
      form,
      versions: [
        {
          id: 'audio-1',
          assetId: 'asset-1',
          targetId: 'target-1',
          versionNo: 1,
          status: 'CONFIRMED',
          source: 'UPLOAD',
          createdAt: '2026-10-01'
        }
      ],
      selectedVersion: 'audio-1',
      pendingFile: null,
      busy: false,
      player: null,
      canRecord: true,
      ...overrides
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('scene audio panel', () => {
  it('hands the native audio element to the parent and releases it before unmount', () => {
    const wrapper = setup()
    expect(wrapper.emitted('element')).toEqual([[wrapper.get('audio').element]])
    expect(wrapper.get('audio').attributes('controls')).toBeDefined()
    wrapper.unmount()
    expect(wrapper.emitted('element')?.at(-1)).toEqual([null])
  })

  it('requests a fixed version binding without changing the parent selection', async () => {
    const wrapper = setup()
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 42)
    expect(wrapper.emitted('bind')).toEqual([['42']])
    expect(wrapper.props('selectedVersion')).toBe('audio-1')
    expect(wrapper.props('form').audio?.version_id).toBe('audio-1')
    wrapper.unmount()
  })

  it('retries with the exact pending file so the parent can preserve upload idempotency', async () => {
    const pendingFile: UploadFile = { name: 'dialogue.mp3', uid: 1, status: 'ready' }
    const wrapper = setup({ pendingFile })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新确认已上传音频')!
      .trigger('click')
    expect(wrapper.emitted('upload')?.[0]?.[0]).toBe(wrapper.props('pendingFile'))
    expect(toRaw(wrapper.emitted('upload')?.[0]?.[0] as UploadFile)).toBe(pendingFile)
    const nextFile: UploadFile = { name: 'new.wav', uid: 2, status: 'ready' }
    wrapper.getComponent(ElUpload).vm.$emit('change', nextFile)
    expect(wrapper.emitted('upload')?.[1]?.[0]).toBe(nextFile)
    wrapper.unmount()
  })

  it('forwards sentence playback and both timing edges while retaining the shared dialogue model', async () => {
    const wrapper = setup()
    const row = wrapper.props('form').dialogue[0]!
    const dialogue = wrapper.getComponent(DialogueFields)
    expect(dialogue.props('timing')).toBe(true)
    expect(dialogue.props('canRecord')).toBe(true)
    expect(dialogue.props('audio')).toBe(wrapper.props('form').audio)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '记录本句开始')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '记录本句结束')!
      .trigger('click')
    expect(wrapper.emitted('record')).toEqual([
      [row, 'start_ms'],
      [row, 'end_ms']
    ])
    dialogue.vm.$emit('play', row)
    expect(wrapper.emitted('play')).toEqual([[row]])
    const replacement = [createDialogueRow()]
    dialogue.vm.$emit('update:modelValue', replacement)
    expect(toRaw(wrapper.props('form').dialogue)).toBe(replacement)
    wrapper.unmount()
  })

  it('keeps recording unavailable until the parent has loaded the audio source', () => {
    const wrapper = setup({ canRecord: false })
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === '记录本句开始')!
        .attributes('disabled')
    ).toBeDefined()
    wrapper.unmount()
  })

  it('forwards audio operations and disables upload while the parent is busy', async () => {
    const wrapper = setup()
    for (const [label, event] of [
      ['加载音频版本', 'load'],
      ['播放整段音频', 'play'],
      ['刷新音频地址', 'refresh'],
      ['移除整段音频', 'remove']
    ]) {
      await wrapper
        .findAll('button')
        .find((button) => button.text() === label)!
        .trigger('click')
      expect(wrapper.emitted(event!)).toHaveLength(1)
    }
    await wrapper.setProps({ busy: true })
    expect(wrapper.getComponent(ElUpload).props('disabled')).toBe(true)
    wrapper.unmount()
  })
})

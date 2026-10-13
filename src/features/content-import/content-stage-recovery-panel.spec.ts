import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ContentStageRecoveryPanel from './content-stage-recovery-panel.vue'

describe('candidate failure recovery entry', () => {
  it('uses the exact candidate stage and current edit version instead of asking for copied identifiers', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return new Response(
        JSON.stringify({
          public_id: 'stage-asr-1',
          stage: 'ASR_POLL',
          status: 'FAILED',
          attempt: 2,
          input_hash: 'input',
          config_version: 'config',
          fencing_version: 3,
          error_code: 'ASR_POLL_FAILED'
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(ContentStageRecoveryPanel, {
      props: { stageId: 'stage-asr-1', expectedEditVersion: 7 },
      global: { plugins: [createPinia(), router, ElementPlus] }
    })
    try {
      expect(wrapper.find('input[aria-label="失败阶段编号"]').element).toHaveProperty(
        'value',
        'stage-asr-1'
      )
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '读取阶段状态')!
        .trigger('click')
      await flushPromises()
      expect(calls).toContain('/api/v1/admin/content-stages/stage-asr-1')
      expect(wrapper.find('input[aria-label="当前草稿编辑版本"]').element).toHaveProperty(
        'value',
        '7'
      )
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
})

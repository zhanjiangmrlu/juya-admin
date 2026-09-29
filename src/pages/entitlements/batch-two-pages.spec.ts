import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import CampaignEditPage from '@/pages/campaigns/campaign-edit-page.vue'
import CampaignListPage from '@/pages/campaigns/campaign-list-page.vue'

import type { Component } from 'vue'

import FormalGrantPage from './formal-grant-page.vue'
import LimitedGrantPage from './limited-grant-page.vue'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
function campaign(id: string) {
  return {
    id,
    name: `活动 ${id}`,
    status: 'OPEN',
    version: 3,
    created_at: '',
    updated_at: '',
    available_operations: ['capacity'],
    current_version: {
      id: `VERSION-${id}`,
      version_no: 1,
      status: 'OPEN',
      duration_days: 3,
      activation_window_days: 7,
      capacity: 30,
      granted_user_count: 2,
      grant_starts_at: null,
      grant_ends_at: null,
      locked_at: null,
      version: 1,
      scene_ids: []
    }
  }
}
async function setup(component: Component, path = '/test') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().csrfToken = 'csrf-test'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/test', component },
      { path: '/campaigns/:id/edit', name: 'campaign-edit', component },
      { path: '/entitlements', name: 'entitlements', component: { template: '<div />' } },
      { path: '/campaigns', name: 'campaigns', component: { template: '<div />' } },
      {
        path: '/campaigns/:id/versions',
        name: 'campaign-versions',
        component: { template: '<div />' }
      },
      { path: '/login', name: 'login', component: { template: '<div />' } }
    ]
  })
  await router.push(path)
  const wrapper = mount(component, { global: { plugins: [pinia, router, ElementPlus] } })
  return wrapper
}

describe('batch two page regressions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps campaign B selected when A resolves last and grants VERSION-B', async () => {
    let finishA!: (response: Response) => void
    let finishB!: (response: Response) => void
    const requests: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          requests.push(init)
          return Promise.reject(new TypeError('lost'))
        }
        if (url.endsWith('/A'))
          return new Promise((resolve) => {
            finishA = resolve
          })
        if (url.endsWith('/B'))
          return new Promise((resolve) => {
            finishB = resolve
          })
        return Promise.resolve(
          json({ items: [campaign('A'), campaign('B')], page: 1, page_size: 20, total: 2 })
        )
      })
    )
    const wrapper = await setup(LimitedGrantPage)
    await flushPromises()
    await wrapper.find('input').setValue('USER-1')
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'A')
    await flushPromises()
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'B')
    await flushPromises()
    finishB(json(campaign('B')))
    await flushPromises()
    finishA(json(campaign('A')))
    await flushPromises()
    expect(wrapper.text()).toContain('VERSION-B')
    expect(wrapper.text()).not.toContain('VERSION-A')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '')
    await flushPromises()
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      user_id: 'USER-1',
      campaign_version_id: 'VERSION-B'
    })
    wrapper.unmount()
  })

  it('keeps the newest campaign filter response when the initial request resolves last', async () => {
    let finishOld!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('status=DRAFT'))
          return Promise.resolve(
            json({
              items: [{ ...campaign('B'), status: 'DRAFT' }],
              page: 1,
              page_size: 20,
              total: 1
            })
          )
        return new Promise((resolve) => {
          finishOld = resolve
        })
      })
    )
    const wrapper = await setup(CampaignListPage)
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'DRAFT')
    wrapper.findComponent(ElSelect).vm.$emit('change', 'DRAFT')
    await flushPromises()
    finishOld(json({ items: [campaign('A')], page: 1, page_size: 20, total: 1 }))
    await flushPromises()
    expect(wrapper.text()).toContain('活动 B')
    expect(wrapper.text()).not.toContain('活动 A')
    wrapper.unmount()
  })

  it('labels conflict preview version 4 as projected while current version is not fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('content-packages'))
          return Promise.resolve(
            json({
              items: [{ id: 'PACKAGE-1', name: '包', status: 'ACTIVE', sort_order: 1 }],
              page: 1,
              page_size: 20,
              total: 1
            })
          )
        if (url.includes('/commands/'))
          return Promise.resolve(
            json(
              {
                code: 'CONFLICT',
                message: '版本冲突',
                request_id: 'req-409',
                details: { current_version: 3 }
              },
              409
            )
          )
        return Promise.resolve(
          json({
            id: 'FORMAL-1',
            user_id: 'USER-1',
            package_id: 'PACKAGE-1',
            status: 'ACTIVE',
            term: 'MONTH_3',
            version: 4,
            granted_at: '2026-09-29T00:00:00Z',
            expires_at: null
          })
        )
      })
    )
    const wrapper = await setup(FormalGrantPage)
    await flushPromises()
    await wrapper.find('input[placeholder="输入用户编号"]').setValue('USER-1')
    wrapper.findAllComponents(ElSelect)[1]?.vm.$emit('update:modelValue', 'PACKAGE-1')
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '测试')
    await flushPromises()
    expect(wrapper.text()).not.toMatch(/服务端最新版本：\s*v4/)
    expect(wrapper.text()).toMatch(/预览.*v4/)
    wrapper.unmount()
  })

  it('renders 422 field validation details on campaign save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            code: 'VALIDATION_ERROR',
            message: '请求参数不正确',
            request_id: 'req-fields',
            details: {
              errors: [{ loc: ['body', 'name'], msg: '名称不得为空', type: 'value_error' }]
            }
          },
          422
        )
      )
    )
    const wrapper = await setup(CampaignEditPage, '/campaigns/new/edit')
    await wrapper.find('input').setValue('活动')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('名称不得为空')
    expect(wrapper.text()).toContain('req-fields')
    wrapper.unmount()
  })

  it('renders 5xx request ID and recovery on campaign list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: '服务暂不可用',
            request_id: 'req-list-503',
            details: {}
          },
          503
        )
      )
    )
    const wrapper = await setup(CampaignListPage)
    await flushPromises()
    expect(wrapper.text()).toContain('req-list-503')
    expect(wrapper.text()).toContain('重试')
    wrapper.unmount()
  })

  it('shows server rate-limit retry timing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            code: 'RATE_LIMITED',
            message: '操作过于频繁',
            request_id: 'req-429',
            details: { retry_after_seconds: 30 }
          },
          429
        )
      )
    )
    const wrapper = await setup(CampaignListPage)
    await flushPromises()
    expect(wrapper.text()).toContain('30 秒')
    expect(wrapper.text()).toContain('req-429')
    wrapper.unmount()
  })
})

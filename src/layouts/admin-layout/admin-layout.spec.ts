import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ADMIN_PAGE_DEFINITIONS, PRIMARY_NAVIGATION } from '@/app/admin-navigation'

import AdminLayout from './admin-layout.vue'

describe('admin layout', () => {
  it('declares all A01-A26 pages and the fixed primary navigation order', () => {
    expect(ADMIN_PAGE_DEFINITIONS.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: 26 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`)
    )
    expect(PRIMARY_NAVIGATION.map((item) => item.label)).toEqual([
      '工作台',
      '用户管理',
      '统一权益中心',
      '限时活动配置',
      '消息中心',
      '问题反馈'
    ])
  })

  it('keeps the application shell within a 1280px viewport', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          component: AdminLayout,
          path: '/',
          children: [
            {
              component: defineComponent({ template: '<div>Dashboard</div>' }),
              meta: { pageNumber: 'A01', title: '工作台' },
              path: 'dashboard'
            }
          ]
        }
      ]
    })
    await router.push('/dashboard')
    await router.isReady()

    const wrapper = mount(AdminLayout, {
      attachTo: document.body,
      global: { plugins: [createPinia(), router, ElementPlus] }
    })

    expect(wrapper.find('.admin-layout').exists()).toBe(true)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
    wrapper.unmount()
  })
})

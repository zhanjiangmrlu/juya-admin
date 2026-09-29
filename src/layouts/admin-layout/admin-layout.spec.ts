import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ADMIN_NAVIGATION_GROUPS, ADMIN_PAGE_DEFINITIONS } from '@/app/admin-navigation'

import AdminLayout from './admin-layout.vue'

describe('admin layout', () => {
  it('groups all A01-A26 pages into the fixed Element Plus navigation order', () => {
    expect(ADMIN_PAGE_DEFINITIONS.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: 26 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`)
    )
    expect(ADMIN_NAVIGATION_GROUPS.map((item) => item.label)).toEqual([
      '工作台',
      '用户管理',
      '统一权益中心',
      '限时活动配置',
      '消息中心',
      '问题反馈',
      '内容生产',
      '系统配置',
      '汇总统计'
    ])
    const groupedPageNumbers = ADMIN_NAVIGATION_GROUPS.flatMap((item) => item.pages).map(
      (page) => page.pageNumber
    )
    expect(groupedPageNumbers).toHaveLength(26)
    expect(groupedPageNumbers).toEqual(
      expect.arrayContaining(ADMIN_PAGE_DEFINITIONS.map((page) => page.pageNumber))
    )
    expect(
      ADMIN_NAVIGATION_GROUPS.flatMap((item) => item.pages)
        .filter((page) => page.requiresContext)
        .map((page) => page.pageNumber)
    ).toEqual(['A03', 'A04', 'A08', 'A09', 'A11', 'A12', 'A15', 'A16', 'A19', 'A20', 'A21', 'A22'])
  })

  it('keeps the application shell within a 1280px viewport', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          // eslint-disable-next-line vue/one-component-per-file -- 路由测试使用最小内联壳组件
          component: defineComponent({ template: '<RouterView />' }),
          path: '/',
          children: [
            {
              // eslint-disable-next-line vue/one-component-per-file -- 路由测试使用最小内联页面组件
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
    expect(wrapper.findComponent({ name: 'ElMenu' }).exists()).toBe(true)
    expect(wrapper.findAll('.el-sub-menu__title')).toHaveLength(9)
    expect(
      wrapper
        .findAll('.el-menu-item')
        .some((item) => item.text().includes('A26') && item.text().includes('系统配置'))
    ).toBe(true)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
    wrapper.unmount()
  })
})

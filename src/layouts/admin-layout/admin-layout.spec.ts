import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ADMIN_NAVIGATION_GROUPS, ADMIN_PAGE_DEFINITIONS } from '@/app/admin-navigation'

import AdminLayout from './admin-layout.vue'

describe('admin layout', () => {
  it('keeps all A01-A26 routes while showing only directly accessible navigation pages', () => {
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
    expect(groupedPageNumbers).toEqual([
      'A01',
      'A02',
      'A05',
      'A06',
      'A07',
      'A10',
      'A13',
      'A14',
      'A17',
      'A18',
      'A23',
      'A24',
      'A26',
      'A25'
    ])
    expect(
      ADMIN_NAVIGATION_GROUPS.flatMap((item) => item.pages).every(
        (page) => !page.path.includes(':')
      )
    ).toBe(true)
  })

  it('highlights the owning list for hidden pages and the selected entry for visible pages', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ADMIN_PAGE_DEFINITIONS.map((page) => ({
        component: { template: '<div />' },
        meta: {
          navigationPath: page.navigationPath,
          pageNumber: page.pageNumber,
          title: page.title
        },
        path: page.path
      }))
    })
    await router.push('/users/USER-1')
    await router.isReady()
    const wrapper = mount(AdminLayout, {
      attachTo: document.body,
      global: { plugins: [createPinia(), router, ElementPlus] }
    })

    const cases = [
      ['/users/USER-1', 'A02'],
      ['/contacts/corrections/COR-1', 'A02'],
      ['/entitlements/formal/FORMAL-1/action', 'A05'],
      ['/entitlements/limited/LIMITED-1/action', 'A05'],
      ['/campaigns/CAMP-1/edit', 'A10'],
      ['/campaigns/CAMP-1/versions', 'A10'],
      ['/feedback/FB-1', 'A14'],
      ['/feedback/FB-1/respond', 'A14'],
      ['/content/ocr/JOB-1/ITEM-1', 'A17'],
      ['/content/scenes/SCENE-1/edit', 'A17'],
      ['/content/scenes/SCENE-1/audio', 'A17'],
      ['/content/scenes/REV-1/publish', 'A17'],
      ['/entitlements/formal/grant', 'A06'],
      ['/entitlements/limited/grant', 'A07'],
      ['/content/import', 'A18'],
      ['/content/discovery-config', 'A23'],
      ['/content/jobs', 'A24']
    ] as const
    try {
      for (const [path, activePageNumber] of cases) {
        await router.push(path)
        await flushPromises()
        const menu = wrapper.findComponent({ name: 'ElMenu' })
        expect(menu.props('defaultActive'), path).toBe(activePageNumber)
        const activeItems = wrapper
          .findAllComponents({ name: 'ElMenuItem' })
          .filter((item) => item.classes().includes('is-active'))
        expect(
          activeItems.map((item) => item.props('index')),
          path
        ).toEqual([activePageNumber])
        expect(wrapper.findAll('.el-menu-item')).toHaveLength(14)
        expect(wrapper.find('.el-menu-item.is-disabled').exists()).toBe(false)
      }
      await wrapper.find('.el-menu-item.is-active').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/content/jobs')
    } finally {
      wrapper.unmount()
    }
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
            },
            {
              // eslint-disable-next-line vue/one-component-per-file -- 路由测试使用最小内联页面组件
              component: defineComponent({ template: '<div>Work Items</div>' }),
              meta: { pageNumber: 'A13', title: '消息中心' },
              path: 'work-items'
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
    expect(wrapper.find('.menu-scrollbar').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ElMenu' }).exists()).toBe(true)
    expect(wrapper.findAll('.el-sub-menu__title')).toHaveLength(2)
    const directItems = wrapper.findAll('.top-level-item')
    expect(directItems.map((item) => item.text())).toEqual([
      '工作台',
      '用户管理',
      '限时活动配置',
      '消息中心',
      '问题反馈',
      '系统配置',
      '汇总统计'
    ])
    expect(wrapper.findAll('.el-menu-item')).toHaveLength(14)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )

    await directItems[3]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/work-items')
    wrapper.unmount()
  })
})

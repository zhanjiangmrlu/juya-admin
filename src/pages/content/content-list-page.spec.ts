import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ContentListPage from './content-list-page.vue'

describe('content list page', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows a pending list without sending a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const wrapper = mount(ContentListPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { RouterLink: { template: '<a><slot :navigate="() => {}" /></a>' } }
      }
    })

    await Promise.resolve()
    expect(wrapper.text()).toContain('内容列表接口待接入')
    expect(wrapper.text()).toContain('0 个未知请求')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

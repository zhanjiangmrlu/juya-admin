import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/use-admin-api-client', () => ({ useAdminApiClient: () => ({}) }))
vi.mock('@/features/users/user-adapter', () => ({
  createUserAdapter: () => ({
    getUserDetail: async () => ({ nickname: 'Mia', juya_number: 'JY-0188' })
  })
}))

import EntitlementPreviewDialog from './entitlement-preview-dialog.vue'

describe('limited entitlement confirmation', () => {
  it('shows the real identity, activity and server preview deadline with optional grant reason', async () => {
    const wrapper = mount(EntitlementPreviewDialog, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
      props: {
        modelValue: true,
        before: null,
        after: {
          status: 'PENDING',
          grantedAt: '2026-10-14T10:00:00Z',
          expiresAt: null,
          startDeadline: '2026-10-21T10:00:00Z'
        },
        actualOperation: 'GRANT',
        userLabel: 'Mia · JY-0188',
        userId: 'user-1',
        contentLabel: '秋季练习',
        contentKind: '活动',
        previewedAt: '2026-10-14T10:00:00Z',
        submitting: false,
        reasonRequired: false,
        expectedVersion: 3,
        objectId: 'version-1'
      }
    })
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Mia · JY-0188')
    expect(text).toContain('活动')
    expect(text).toContain('秋季练习')
    expect(text).toContain('未开通')
    expect(text).toContain('待开始')
    expect(text).toContain('确认时按服务端时间重新计算启动截止')
    expect(text).not.toContain('高风险')
    const button = [...document.body.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('确认开通')
    )
    expect(button?.disabled).toBe(false)
    button?.click()
    await flushPromises()
    expect(wrapper.emitted('confirm')).toEqual([['']])
    wrapper.unmount()
  })
})

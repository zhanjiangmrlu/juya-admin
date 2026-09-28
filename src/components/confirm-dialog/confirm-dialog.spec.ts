import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import ConfirmDialog from './confirm-dialog.vue'

describe('confirm dialog', () => {
  it('shows the target, state change and scope, then emits the required reason', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
      props: {
        afterStatus: '已暂停',
        beforeStatus: '生效中',
        impactScope: '停止该用户继续学习，但保留历史记录',
        modelValue: true,
        objectId: 'ENT-1001',
        reasonRequired: true,
        title: '确认暂停正式权益'
      }
    })
    await wrapper.vm.$nextTick()

    expect(document.body.textContent).toContain('ENT-1001')
    expect(document.body.textContent).toContain('生效中')
    expect(document.body.textContent).toContain('已暂停')
    expect(document.body.textContent).toContain('停止该用户继续学习，但保留历史记录')

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('确认执行')
    )
    expect(confirmButton?.hasAttribute('disabled')).toBe(true)

    await wrapper.find('textarea').setValue('用户主动申请暂停')
    confirmButton?.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('confirm')).toEqual([['用户主动申请暂停']])
    wrapper.unmount()
  })
})

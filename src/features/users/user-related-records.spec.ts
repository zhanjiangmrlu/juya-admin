import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import UserRelatedRecords from './user-related-records.vue'

describe('user audit operators', () => {
  it('shows the recorded administrator name and keeps unresolved identities explicit', async () => {
    const wrapper = mount(UserRelatedRecords, {
      props: {
        records: {
          audit: [
            {
              id: 'named',
              action: 'contact.view.detail',
              actor_public_id: '1',
              actor_name: '运营管理员',
              reason: null
            },
            { id: 'legacy', action: 'contact.view.list', actor_public_id: '2' },
            { id: 'system', action: 'account.cleanup', actor_public_id: 'system' },
            { id: 'unknown', action: 'contact.view.list', actor_public_id: null }
          ]
        }
      },
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } }
    })
    await flushPromises()
    const operatorCells = wrapper
      .findAll('tbody tr')
      .map((row) => row.findAll('td')[1]?.text())
      .filter(Boolean)
    expect(operatorCells).toEqual(['运营管理员', '未知操作人（ID：2）', '系统', '未知操作人'])
    expect(wrapper.findAll('tbody tr').map((row) => row.findAll('td')[3]?.text())).toEqual([
      '-',
      '-',
      '-',
      '-'
    ])
    wrapper.unmount()
  })
})

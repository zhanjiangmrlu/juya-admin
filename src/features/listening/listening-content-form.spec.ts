import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ListeningContentForm from './listening-content-form.vue'
import { emptyPayload } from './listening-model'

it('clears a topic that belongs to another selected category', async () => {
  const page = mount(ListeningContentForm, {
    props: {
      modelValue: emptyPayload(),
      topic: 't1',
      categories: [
        { id: 'c1', name: '分类一', name_en: '', sort_order: 0, revision: 1 },
        { id: 'c2', name: '分类二', name_en: '', sort_order: 1, revision: 1 }
      ],
      topics: [
        {
          id: 't1',
          category_id: 'c1',
          name: '主题一',
          name_en: '',
          description: '',
          sort_order: 0,
          revision: 1
        },
        {
          id: 't2',
          category_id: 'c2',
          name: '主题二',
          name_en: '',
          description: '',
          sort_order: 0,
          revision: 1
        }
      ]
    }
  })
  await page.get('select[aria-label="所属分类"]').setValue('c2')
  expect(page.emitted('update:topic')?.at(-1)).toEqual([''])
  expect(page.get('select[aria-label="所属主题"]').text()).toContain('主题二')
  expect(page.get('select[aria-label="所属主题"]').text()).not.toContain('主题一')
})

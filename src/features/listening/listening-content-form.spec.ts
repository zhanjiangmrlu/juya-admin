import { mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { expect, it } from 'vitest'

import ListeningContentForm from './listening-content-form.vue'
import { emptyPayload } from './listening-model'
it('selects a direct category without a topic requirement and shares vocabulary editing', async () => {
  const page = mount(ListeningContentForm, {
    props: {
      modelValue: emptyPayload(),
      category: 'c1',
      categories: [
        { id: 'c1', name: '分类一', name_en: '', sort_order: 0, revision: 1 },
        { id: 'c2', name: '分类二', name_en: '', sort_order: 1, revision: 1 }
      ]
    }
  })
  expect(page.text()).not.toContain('所属主题')
  page.getComponent(ElSelect).vm.$emit('update:modelValue', 'c2')
  expect(page.emitted('update:category')?.at(-1)).toEqual(['c2'])
  expect(page.text()).toContain('重点词汇')
})

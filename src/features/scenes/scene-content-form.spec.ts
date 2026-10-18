import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { blankContent } from './editor-model'
import SceneContentForm from './scene-content-form.vue'

it('edits Chinese and English titles independently and preserves English punctuation', async () => {
  const content = blankContent()
  const page = mount(SceneContentForm, {
    props: { modelValue: content, limits: null },
    global: { stubs: { ElDialog: true, SceneMediaField: true, SceneWordSource: true } }
  })
  await page.get('input[aria-label="中文标题"]').setValue('为戏剧社挑一个剧本')
  await page.get('input[aria-label="英文标题"]').setValue('Choosing a Play: Drama Club!')
  expect(content.name).toBe('为戏剧社挑一个剧本')
  expect(content.title_en).toBe('Choosing a Play: Drama Club!')
  page.unmount()
})

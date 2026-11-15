import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { blankContent } from '@/features/scenes/editor-model'
import SceneContentForm from '@/features/scenes/scene-content-form.vue'

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

it('replaces a conflicting document hint only after the administrator explicitly selects a current sentence', async () => {
  const content = blankContent()
  content.dialogue = [
    { id: 'line', speaker: 'A', english: '😀 I bought coffee.', chinese: '买咖啡' }
  ]
  content.vocabulary = [
    {
      id: 'word',
      english: 'buy',
      meaning: '买',
      phonetic: '',
      source_hint: 'A conflicting sentence.',
      source_reason: 'source_hint_conflict',
      pronunciation_text: 'buy',
      pronunciation_issue: false,
      source: null
    }
  ]
  const page = mount(SceneContentForm, {
    props: { modelValue: content, limits: null },
    global: { stubs: { ElDialog: true, SceneMediaField: true, SceneWordSource: true } }
  })
  const source = { line_id: 'line', start: 5, end: 11, quote: 'bought' }
  page.getComponent({ name: 'SceneWordSource' }).vm.$emit('select', source)
  expect(content.vocabulary[0]?.source_hint).toBe('😀 I bought coffee.')
  expect(content.vocabulary[0]?.source).toEqual(source)
  expect(content.vocabulary[0]?.source_reason).toBeNull()
  page.unmount()
})

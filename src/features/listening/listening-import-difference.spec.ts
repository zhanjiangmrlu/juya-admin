import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ListeningImportDifference from './listening-import-difference.vue'
import { emptyPayload } from './listening-model'

it('renders complete tags, all expression groups and word references using readable labels', () => {
  const expressions = (prefix: string) =>
    Array.from({ length: 5 }, (_, index) => ({
      english: `${prefix} phrase ${index + 1}`,
      chinese: `${prefix}释义${index + 1}`,
      example: `${prefix} example ${index + 1}`
    }))
  const page = mount(ListeningImportDifference, {
    props: {
      before: {
        topic_id: 't',
        payload: {
          ...emptyPayload(),
          tags: ['旧标签', '日常'],
          expressions: expressions('old'),
          word_meanings: [
            { word: 'rest', start: 0, end: 4, chinese: '休息', lemma: 'rest', phonetic: '/rest/' }
          ]
        }
      },
      after: {
        topic_id: 't',
        payload: {
          ...emptyPayload(),
          tags: ['新标签', '生活'],
          expressions: expressions('new'),
          word_meanings: [
            { word: 'water', start: 8, end: 13, chinese: '水', lemma: 'water', phonetic: '/water/' }
          ]
        }
      },
      topics: []
    }
  })
  expect(page.text()).toContain('旧标签、日常')
  expect(page.text()).toContain('新标签、生活')
  for (const prefix of ['old', 'new']) {
    for (let index = 1; index <= 5; index++) {
      expect(page.text()).toContain(`${prefix} phrase ${index}`)
      expect(page.text()).toContain(`中文释义：${prefix}释义${index}`)
      expect(page.text()).toContain(`替换例句：${prefix} example ${index}`)
    }
  }
  expect(page.text()).toContain('正文位置：8—13')
  expect(page.text()).toContain('原形：water')
  expect(page.text()).toContain('音标：/water/')
  expect(page.text()).not.toContain('"english"')
  expect(page.text()).not.toContain('"start"')
  expect(page.text()).not.toContain('[\n')
  page.unmount()
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SceneReader from './scene-reader.vue'

describe('read-only publication preview', () => {
  it.each([
    [
      [3, 10],
      [7, 17]
    ],
    [
      [3, 10],
      [3, 17]
    ],
    [
      [3, 17],
      [7, 10]
    ],
    [
      [3, 17],
      [3, 17]
    ]
  ])('renders overlapping ranges as their union without repeating the original', (...ranges) => {
    const english = '😀 tea and coffee.'
    const page = mount(SceneReader, {
      props: {
        content: {
          name: '茶',
          title_en: 'Tea',
          dialogue: [{ id: 'one', speaker: 'A', english, chinese: '茶和咖啡' }],
          vocabulary: ranges.map(([start, end], index) => ({
            id: `word-${index}`,
            english: english.slice(start, end),
            meaning: '',
            phonetic: '',
            pronunciation_text: '',
            pronunciation_issue: false,
            source: { line_id: 'one', start: start!, end: end!, quote: english.slice(start, end) }
          })),
          chunks: []
        }
      }
    })
    expect(page.get('.dialogue .english').text()).toBe(english)
    expect(
      page
        .findAll('.dialogue mark')
        .map((node) => node.text())
        .join('')
    ).toBe('tea and coffee')
    page.unmount()
  })
  it('shows both saved titles and independently hides missing vocabulary fields', () => {
    const page = mount(SceneReader, {
      props: {
        content: {
          name: '戏剧社',
          title_en: 'Choosing a Play!',
          dialogue: [],
          vocabulary: [
            {
              id: 'word',
              english: 'drama',
              meaning: '',
              phonetic: '',
              pronunciation_text: '',
              pronunciation_issue: false
            }
          ],
          chunks: []
        }
      }
    })
    expect(page.text()).toContain('Choosing a Play!')
    expect(page.text()).toContain('戏剧社')
    expect(page.text()).toContain('drama')
    expect(page.find('.word .meaning').exists()).toBe(false)
    expect(page.find('.word .phonetic').exists()).toBe(false)
    page.unmount()
  })
  it('escapes dialogue, highlights only the confirmed occurrence and never offers learner actions', async () => {
    const page = mount(SceneReader, {
      props: {
        content: {
          name: '点茶',
          title_en: '',
          dialogue: [
            { id: 'one', speaker: 'A', english: 'tea <img src=x> tea', chinese: '两杯茶' }
          ],
          vocabulary: [
            {
              id: 'word',
              english: 'tea',
              meaning: '茶',
              phonetic: '',
              pronunciation_text: '',
              pronunciation_issue: false,
              source: { line_id: 'one', start: 16, end: 19, quote: 'tea' }
            }
          ],
          chunks: []
        }
      }
    })
    expect(page.findAll('mark').map((x) => x.text())).toEqual(['tea'])
    expect(page.find('img[src="x"]').exists()).toBe(false)
    expect(page.text()).not.toContain('两杯茶')
    await page.get('[data-action="translation"]').trigger('click')
    expect(page.text()).toContain('两杯茶')
    expect(page.findAll('.dialogue .translation')).toHaveLength(0)
    expect(page.findAll('.translation-section .translation')).toHaveLength(1)
    expect(page.text().indexOf('收起译文')).toBeGreaterThan(
      page.text().indexOf('tea <img src=x> tea')
    )
    expect(page.find('[data-action="complete"]').exists()).toBe(false)
    expect(page.find('[data-action="favorite"]').exists()).toBe(false)
  })
})

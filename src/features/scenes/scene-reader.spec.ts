import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SceneReader from './scene-reader.vue'

describe('read-only publication preview', () => {
  it('escapes dialogue, highlights only the confirmed occurrence and never offers learner actions', async () => {
    const page = mount(SceneReader, {
      props: {
        content: {
          name: '点茶',
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

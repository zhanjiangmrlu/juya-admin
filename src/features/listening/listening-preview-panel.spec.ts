import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { emptyPayload } from './listening-model'
import ListeningPreviewPanel from './listening-preview-panel.vue'

it('uses the supplied published media boundary for playback and image preview', async () => {
  const page = mount(ListeningPreviewPanel, {
    props: {
      article: {
        id: 'article',
        payload: { ...emptyPayload(), audio_id: 'published-audio', image_id: 'published-image' },
        timeline: { state: 'missing' },
        status: 'published',
        version_id: 'version-1'
      },
      mediaBase: '/published/media',
      sourceLabel: '当前发布版',
      readonly: true
    },
    global: {
      stubs: {
        SceneAudio: { props: ['sourceUrl'], template: '<audio :src="sourceUrl" />' },
        ElDialog: true
      }
    }
  })
  expect(page.get('audio').attributes('src')).toBe('/published/media/published-audio')
  expect(page.get('.image-entry img').attributes('src')).toBe('/published/media/published-image')
  expect(page.get('.preview-metadata').text()).not.toContain('version-1')
  expect(page.get('.preview-metadata').text()).toContain('当前发布版')
  expect(page.findAll('button').map((button) => button.text())).not.toContain('确认发布')
  page.unmount()
})

it('hides an empty optional vocabulary section and displays separate senses after translation', async () => {
  const payload = emptyPayload()
  const page = mount(ListeningPreviewPanel, {
    props: { article: { id: 'a', payload, timeline: { state: 'missing' } } },
    global: { stubs: { ElDialog: true } }
  })
  expect(page.find('[data-testid="reader-vocabulary"]').exists()).toBe(false)
  await page.setProps({
    article: {
      id: 'a',
      payload: {
        ...payload,
        vocabulary: [
          {
            id: 'w1',
            english: 'room',
            meaning: '房间',
            phonetic: '',
            source_hint: '',
            source: null
          },
          {
            id: 'w2',
            english: 'room',
            meaning: '余地',
            phonetic: '',
            source_hint: '',
            source: null
          }
        ]
      },
      timeline: { state: 'missing' }
    }
  })
  expect(page.get('[data-testid="reader-vocabulary"]').text()).toContain('房间')
  expect(page.get('[data-testid="reader-vocabulary"]').text()).toContain('余地')
  page.unmount()
})

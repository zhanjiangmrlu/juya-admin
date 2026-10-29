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

import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AudioVersionPage from './audio-version-page.vue'
import BatchJobsPage from './batch-jobs-page.vue'
import OcrReviewPage from './ocr-review-page.vue'

afterEach(() => vi.unstubAllGlobals())

describe('media administration pages', () => {
  it('renders the persisted OCR candidate without pending copy', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(json(jobResponse))
      .mockResolvedValueOnce(
        json({
          asset_id: 'ASSET-1',
          confidence: 0.98,
          confirmed_revision_id: null,
          error_code: null,
          id: 'CANDIDATE-1',
          job_id: 'JOB-1',
          status: 'READY',
          structured_candidate: { title: 'Coffee time' },
          template_type: 'learning-card'
        })
      )
    vi.stubGlobal('fetch', fetchSpy)
    const wrapper = await mountPage(OcrReviewPage, '/content/ocr/JOB-1/ASSET-1')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Coffee time'))
    expect(wrapper.text()).not.toContain('接口待接入')
  })

  it('renders audio targets and their active version', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          items: [
            {
              active_version_id: 'VERSION-1',
              id: 'TARGET-1',
              stable_key: 'SENTENCE-1',
              target_type: 'SENTENCE'
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        json({
          items: [
            {
              asset_id: 'ASSET-1',
              created_at: '2026-09-30T10:00:00Z',
              created_by: '7',
              id: 'VERSION-1',
              processing_job_id: null,
              provider_request_id: null,
              source: 'MANUAL',
              status: 'ACTIVE',
              target_id: 'TARGET-1',
              version_no: 1
            }
          ]
        })
      )
    vi.stubGlobal('fetch', fetchSpy)
    const wrapper = await mountPage(AudioVersionPage, '/content/scenes/SCENE-1/audio')

    await vi.waitFor(() => expect(wrapper.text()).toContain('SENTENCE-1'))
    expect(wrapper.text()).toContain('MANUAL')
    expect(wrapper.text()).not.toContain('接口待接入')
  })

  it('keeps succeeded and failed batch items visible beside trash', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [batchResponse], page: 1, page_size: 20, total: 1 }))
      .mockResolvedValueOnce(
        json({
          items: [
            {
              cleaned_at: null,
              id: 'TRASH-1',
              restored_at: null,
              retention_until: '2026-10-30T10:00:00Z',
              revision_id: 'REV-1',
              scene_id: 'SCENE-1',
              status: 'TRASHED',
              trashed_at: '2026-09-30T10:00:00Z',
              trashed_by: '7'
            }
          ]
        })
      )
    vi.stubGlobal('fetch', fetchSpy)
    const wrapper = await mountPage(BatchJobsPage, '/content/jobs')

    await vi.waitFor(() => expect(wrapper.text()).toContain('COMPLETED_WITH_ERRORS'))
    expect(wrapper.text()).toContain('TRASHED')
    expect(wrapper.text()).not.toContain('接口待接入')
  })
})

async function mountPage(component: object, path: string) {
  const routePath = path.includes('/content/ocr/')
    ? '/content/ocr/:taskId/:itemId'
    : path.includes('/audio')
      ? '/content/scenes/:id/audio'
      : '/content/jobs'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ component, path: routePath }]
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [createPinia(), router, ElementPlus] } })
  await flushPromises()
  return wrapper
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  })
}

const jobResponse = {
  batch_id: null,
  business_key: 'ocr:key',
  cancel_requested_at: null,
  created_at: '2026-09-30T10:00:00Z',
  created_by: '7',
  error_code: null,
  id: 'JOB-1',
  job_type: 'OCR',
  provider_request_id: 'provider-1',
  status: 'SUCCEEDED',
  target_id: 'ASSET-1',
  updated_at: '2026-09-30T10:01:00Z'
}

const batchResponse = {
  business_key: 'batch:key',
  cancel_requested_at: null,
  completed_at: null,
  created_at: '2026-09-30T10:00:00Z',
  created_by: '7',
  failure_count: 1,
  id: 'BATCH-1',
  items: [
    {
      attempt_count: 1,
      error_code: null,
      id: 'ITEM-1',
      item_key: '0:SCENE-1',
      processing_job_id: null,
      result_version: 1,
      status: 'SUCCEEDED',
      target_id: 'SCENE-1'
    },
    {
      attempt_count: 1,
      error_code: 'FAILED',
      id: 'ITEM-2',
      item_key: '1:SCENE-2',
      processing_job_id: null,
      result_version: null,
      status: 'FAILED',
      target_id: 'SCENE-2'
    }
  ],
  job_type: 'VALIDATE',
  status: 'COMPLETED_WITH_ERRORS',
  success_count: 1,
  total_count: 2,
  updated_at: '2026-09-30T10:01:00Z'
}

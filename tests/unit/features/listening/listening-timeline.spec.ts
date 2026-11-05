import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import ListeningTimeline from '@/features/listening/listening-timeline.vue'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/listening-service', () => ({
  listeningRequest: request,
  listeningOperation: vi.fn()
}))
afterEach(() => vi.clearAllMocks())

it.each([
  ['asr_unconfigured', '自动时间轴服务尚未配置'],
  ['asr_permission_denied', '语音识别服务权限不足'],
  ['timeline_coverage_low', '录音与正文匹配不足'],
  ['future_provider_error', '时间轴生成失败']
])('explains timeline failure %s without exposing an internal code', async (code, message) => {
  request.mockResolvedValue({ state: 'failed', error_code: code, words: [] })
  const page = mount(ListeningTimeline, { props: { articleId: 'article', revision: 1 } })
  await flushPromises()
  expect(page.text()).toContain(message)
  expect(page.text()).not.toContain(code)
  expect(page.get('button').text()).toBe('刷新状态')
  expect(page.text()).toContain('重试失败任务')
  page.unmount()
})

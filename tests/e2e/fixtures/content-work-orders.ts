import type { Page } from '@playwright/test'

export const reading = {
  title_en: 'Current reading',
  title_zh: '当前短文',
  category: '生活',
  topic: '日常',
  level: 'A2',
  safe_intro: '本篇简介',
  copyright_source: '已授权原创',
  copyright_status: 'VERIFIED',
  paragraphs_en: ['The current English paragraph.'],
  paragraph_ids: ['paragraph'],
  translation_zh: '当前完整译文。',
  cover_asset_id: null,
  audio: null
}
export const scene = {
  schema_version: 2,
  template_type: 'dialogue',
  title_en: 'Ordering coffee',
  title_zh: '点一杯咖啡',
  summary: '咖啡店点单练习',
  source: '原创',
  copyright: '已授权',
  cover_asset_id: null,
  dialogue: [
    {
      id: 'SENTENCE-1',
      speaker: 'A',
      english: 'What would you like?',
      chinese: '您想要什么？',
      start_ms: 0,
      end_ms: 2000,
      timing_confirmed: true
    }
  ],
  vocabulary: [
    {
      entry_id: 'local-latte',
      entry_version: 1,
      sense_id: 'sense-latte',
      source_id: 'source-latte',
      english: 'latte',
      chinese: '拿铁',
      confirmed: false,
      source_sentence: 'What would you like?',
      source_sentence_ids: ['SENTENCE-1'],
      variants: [],
      allow_synthesis: false
    }
  ],
  chunks: [],
  audio: null
}
const counts = {
  total: 1000,
  processing: 0,
  normal: 900,
  review_required: 60,
  failed: 40,
  confirmed: 0,
  publishable: 0,
  published: 0,
  cancelled: 0
}
export const order = {
  work_order_id: 'order',
  version: 1,
  import_batch_id: 'batch',
  source_mode: 'DOCX',
  series_id: 'series',
  series_title: '生活短文',
  content_type: 'short_reading',
  status: 'ACTIVE',
  created_at: '2026-10-14T00:00:00Z',
  updated_at: '2026-10-14T00:00:00Z',
  counts,
  available_actions: ['organize', 'sampling'],
  pending_commands: [],
  proofreading_set_id: null,
  publication_token: null
}
export const item = {
  item_id: 'one',
  work_order_id: 'order',
  content_id: 'reading',
  revision_id: 'revision',
  edit_version: 1,
  content_version: 1,
  candidate_hash: 'a'.repeat(64),
  title_en: 'Current reading',
  title_zh: '当前短文',
  lifecycle_status: 'DRAFT',
  production_status: 'review_required',
  confirmed: false,
  publishable: false,
  published: false,
  tasks: [],
  issues: [
    {
      id: 'issue',
      message: '请核对完整译文',
      location: ['translation_zh'],
      correction_target: 'content'
    }
  ],
  source_available: true,
  source_snapshot: {
    blocks: [
      { text: 'The immutable original paragraph.', paragraph_index: 2 },
      { text: '不可变原文译文。', paragraph_index: 3 }
    ]
  },
  current: { template: 'short_reading', content: reading }
}
/**
 * 装配当前工作单的确定性接口，不访问真实服务
 * @param page - 本测试独立浏览器页面
 * @param candidate - 本次工作单候选与类型
 * @param candidate.template - 当前候选模板
 * @param candidate.content - 当前完整候选正文
 * @returns 捕获的正式业务请求
 */
export const mockWorkOrder = async (
  page: Page,
  candidate: { template: string; content: Record<string, unknown> } = item.current
) => {
  const requests: {
    path: string
    method: string
    body: Record<string, unknown>
    headers: Record<string, string>
  }[] = []
  const current = structuredClone({
    ...item,
    content_id: candidate.template === 'short_reading' ? 'reading' : 'SCENE-1',
    current: candidate
  })
  let version = 1
  let confirmed = false
  let sampled = false
  let publication = false
  let published = false
  await page.route('**/api/v1/admin/content-production/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const body = req.postData() ? (req.postDataJSON() as Record<string, unknown>) : {}
    requests.push({ path, method: req.method(), body, headers: req.headers() })
    if (path.endsWith('/contexts')) {
      await route.fulfill({
        json: {
          items: (body.content_ids as string[]).map((contentId) => ({
            content_id: contentId,
            work_order_id: 'order',
            work_item_id: 'one',
            production_status: 'review_required'
          }))
        }
      })
      return
    }
    const liveOrder = {
      ...order,
      content_type: candidate.template,
      version,
      proofreading_set_id: sampled ? 'set' : null,
      publication_token: publication ? 'token' : null,
      counts: {
        ...counts,
        ...(confirmed ? { confirmed: 900, publishable: 900 } : {}),
        ...(published ? { published: 900 } : {})
      }
    }
    if (path.endsWith('/correction')) {
      current.current.content = body.current
        ? (body.current as typeof current.current).content
        : current.current.content
      current.edit_version++
      await route.fulfill({
        json: {
          command_id: 'command',
          work_order_id: 'order',
          action: 'correction',
          status: 'SAVED',
          version
        }
      })
      return
    }
    if (path.endsWith('/entry-bindings')) {
      await route.fulfill({
        json: { work_order_id: 'order', item_id: 'one', revision_id: 'revision', bindings: [] }
      })
      return
    }
    if (path.endsWith('/items/one')) {
      await route.fulfill({ json: current })
      return
    }
    if (path.endsWith('/items')) {
      const query = new URL(req.url()).searchParams,
        requestedPage = Number(query.get('page') || 1),
        requestedSize = Number(query.get('page_size') || 20)
      const members = Array.from({ length: 1000 }, (_, index) =>
        index === 0
          ? current
          : {
              ...current,
              item_id: `member-${index}`,
              content_id: `content-${index}`,
              revision_id: `revision-${index}`,
              title_en: `Content ${index}`,
              issues: [],
              tasks: [],
              production_status:
                index < 60 ? 'review_required' : index >= 960 ? 'failed' : 'normal',
              current_draft: false,
              publishable: false
            }
      )
      await route.fulfill({
        json: {
          items: members.slice((requestedPage - 1) * requestedSize, requestedPage * requestedSize),
          page: requestedPage,
          page_size: requestedSize,
          total: 1000,
          counts: liveOrder.counts,
          version,
          collection_hash: `${version}-${current.candidate_hash}-${confirmed}-${published}`
        }
      })
      return
    }
    if (path.endsWith('/usage')) {
      await route.fulfill({
        json: {
          work_order_id: 'order',
          attempts: [],
          retry_count: 0,
          unknown_count: 0,
          cost: null
        }
      })
      return
    }
    if (path.endsWith('/import-preview')) {
      await route.fulfill({
        json: {
          work_order_id: 'order',
          batch_id: 'batch',
          status: 'CONFIRMED',
          preview_hash: 'a'.repeat(64),
          preview_version: 1,
          items: [],
          batch_issues: []
        }
      })
      return
    }
    if (path.endsWith('/from-batch')) {
      await route.fulfill({ json: liveOrder })
      return
    }
    if (path.endsWith('/sampling') && req.method() === 'GET') {
      await route.fulfill({
        json: {
          work_order_id: 'order',
          proofreading_set_id: 'set',
          collection_hash: confirmed ? 'c'.repeat(64) : 'b'.repeat(64),
          status: 'OPEN',
          normal_count: 900,
          sample_ids: ['revision'],
          confirmed_revision_ids: confirmed ? ['revision'] : [],
          candidates: [
            {
              content_type: 'short_reading',
              content_id: 'reading',
              revision_id: 'revision',
              candidate_hash: current.candidate_hash,
              normal: true
            }
          ]
        }
      })
      return
    }
    if (path.endsWith('/publication') && req.method() === 'GET') {
      await route.fulfill({
        json: {
          work_order_id: 'order',
          token: 'token',
          version: 1,
          collection_hash: 'd'.repeat(64),
          status: published ? 'COMPLETED' : 'PREVIEW',
          stage_id: null,
          expires_at: '2026-10-15T00:00:00Z',
          candidates: [
            {
              content_type: 'short_reading',
              content_id: 'reading',
              revision_id: 'revision',
              candidate_hash: current.candidate_hash,
              expected_version: 1,
              warning_codes: []
            }
          ],
          results: published ? [{ revision_id: 'revision', status: 'SUCCEEDED' }] : []
        }
      })
      return
    }
    if (req.method() === 'POST') {
      version++
      if (path.endsWith('/sampling')) sampled = true
      if (body.operation === 'confirm') confirmed = true
      if (path.endsWith('/publication-preview')) publication = true
      if (path.endsWith('/publication-confirm')) published = true
      await route.fulfill({
        json: {
          command_id: 'command',
          work_order_id: 'order',
          action: 'operation',
          status: 'SUCCEEDED',
          version
        }
      })
      return
    }
    await route.fulfill({ json: liveOrder })
  })
  return requests
}

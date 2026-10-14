import { describe, expect, it, vi } from 'vitest'

import { createWorkOrderAdapter } from './work-order-adapter'
import {
  issueAction,
  issueFieldLabel,
  originalParagraphs,
  publicationRetryIds
} from './work-order-model'

describe('工作单契约与业务范围', () => {
  it('分页保留服务端整单计数，不把导入成功当正常', async () => {
    const response = {
      items: [{ item_id: 'one', production_status: 'review_required' }],
      total: 60,
      counts: { total: 1000, normal: 900, review_required: 60, failed: 40 }
    }
    const request = vi.fn().mockResolvedValue(response)
    const result = await createWorkOrderAdapter({ request }).items(
      'order/a',
      2,
      20,
      'review_required'
    )
    expect(result).toEqual(response)
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/content-production/work-orders/order%2Fa/items',
      query: { page: 2, page_size: 20, status: 'review_required' }
    })
  })
  it('范围命令发送正式幂等头和精确成员，不发送旧快捷头', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'QUEUED' })
    await createWorkOrderAdapter({ request }).command(
      'order',
      'organize',
      { expected_version: 3, scope: 'selected', selected_item_ids: ['one'] },
      'retry-key'
    )
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content-production/work-orders/order/organize',
      body: { expected_version: 3, scope: 'selected', selected_item_ids: ['one'] },
      headers: { 'Idempotency-Key': 'retry-key' }
    })
  })
  it('恢复批次和挂起命令使用服务端持久上下文', async () => {
    const request = vi.fn().mockResolvedValue({
      work_order_id: 'restored',
      series_id: 'retained',
      content_type: 'short_reading'
    })
    const adapter = createWorkOrderAdapter({ request })
    expect((await adapter.fromBatch('batch')).series_id).toBe('retained')
    await adapter.resume('restored', 'pending')
    expect(request.mock.calls[1]?.[0].path).toBe(
      '/api/v1/admin/content-production/work-orders/restored/commands/pending/resume'
    )
  })
  it('完整词条作用域和固定版本关系不丢失', async () => {
    const raw = {
      bindings: [
        {
          namespace: 'library',
          content_type: 'dialogue',
          content_id: 'content',
          import_entry_id: 'same-key',
          lexicon_entry_id: 'central',
          definition_version: 4
        }
      ]
    }
    const request = vi.fn().mockResolvedValue(raw)
    expect(await createWorkOrderAdapter({ request }).bindings('order', 'one', 'old')).toEqual(raw)
    expect(request.mock.calls[0]?.[0].query).toEqual({ revision_id: 'old' })
  })
  it('原文缺失不冒用已修改候选，原文读取只限快照', () => {
    expect(originalParagraphs(null)).toEqual([])
    expect(originalParagraphs({ paragraphs: [{ text: 'Original', paragraph_index: 2 }] })).toEqual([
      { text: 'Original', locator: '第 2 段' }
    ])
    expect(
      originalParagraphs({
        blocks: [{ text: 'DOCX 原文', paragraph_index: 4, role: 'chinese' }],
        document_sha256: 'private'
      })
    ).toEqual([{ text: 'DOCX 原文', locator: '第 4 段' }])
  })
  it('问题到正确功能并且成功发布不进入重试', () => {
    expect(issueFieldLabel(['dialogue.2.chinese'])).toBe('中文翻译 3')
    expect(issueFieldLabel(['vocabulary[1].chinese'])).toBe('vocabulary 中文 2')
    expect(issueFieldLabel(['translation_zh'])).toBe('全文中文翻译')
    expect(issueAction('audio')).toEqual({ section: 'audio', label: '试听与调整边界' })
    expect(issueAction('entries').section).toBe('entries')
    expect(
      publicationRetryIds([
        { revision_id: 'ok', status: 'SUCCEEDED' },
        { revision_id: 'bad', status: 'FAILED' },
        { revision_id: 'unknown', status: 'UNKNOWN' }
      ])
    ).toEqual(['bad'])
  })
  it('原始表格定位不伪装为段落，保留多文档输入', () => {
    expect(
      originalParagraphs({
        blocks: [],
        workbook: { content_row: { title_en: 'Original workbook' } }
      })
    ).toEqual([{ text: 'title_en：Original workbook', locator: '原始内容表 · 第 1 行' }])
    expect(
      originalParagraphs({
        blocks: [
          { kind: 'table_cell', table_index: 2, row_index: 3, column_index: 4, text: '原始单元格' }
        ]
      })
    ).toEqual([{ text: '原始单元格', locator: '表 2 · 第 3 行 · 第 4 列' }])
    expect(
      originalParagraphs({
        documents: [{ blocks: [{ text: '第一篇' }] }, { blocks: [{ text: '第二篇' }] }]
      }).map((row) => row.text)
    ).toEqual(['第一篇', '第二篇'])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyExpectedRejection } from './real-admin-browser-rejections.mjs'

const entities = {
  revision_id: '01M4T5ZMAKXZQW23BT4YHMW284',
  slice_revision_id: '01M4T60H77ENGYAQAWP8EHPPYT'
}
const emptyDraft = {
  method: 'GET',
  path: `/api/v1/admin/content/revisions/${entities.revision_id}/audio-production`,
  status: 409,
  error_code: 'CANDIDATE_TEXT_REQUIRED'
}
const audioDraft = {
  method: 'GET',
  path: `/api/v1/admin/content/revisions/${entities.slice_revision_id}/audio-production`,
  status: 404,
  error_code: 'AUTO_AUDIO_NOT_FOUND'
}

describe('真实管理浏览器验收的音频门禁契约', () => {
  it('记录本次明确空草稿的正文前置门禁', () => {
    assert.equal(classifyExpectedRejection(emptyDraft, entities), 'EMPTY_DRAFT_TEXT_REQUIRED')
  })

  it('记录本次明确尚无自动任务的音频草稿门禁', () => {
    assert.equal(classifyExpectedRejection(audioDraft, entities), 'AUTO_AUDIO_TASK_NOT_CREATED')
  })

  for (const [name, response, scope] of [
    [
      '其它草稿',
      {
        ...emptyDraft,
        path: emptyDraft.path.replace(entities.revision_id, '01M4T5ZMAK70XSW8FM6VNP6628')
      },
      entities
    ],
    ['错误的请求方法', { ...emptyDraft, method: 'POST' }, entities],
    ['正文门禁错误状态', { ...emptyDraft, status: 404 }, entities],
    ['正文门禁错误代码', { ...emptyDraft, error_code: 'AUTO_AUDIO_NOT_FOUND' }, entities],
    ['成功状态', { ...emptyDraft, status: 200 }, entities],
    ['音频门禁错误状态', { ...audioDraft, status: 409 }, entities],
    ['音频门禁错误代码', { ...audioDraft, error_code: 'CANDIDATE_TEXT_REQUIRED' }, entities],
    [
      '其它音频接口',
      { ...audioDraft, path: audioDraft.path.replace('audio-production', 'candidates/latest') },
      entities
    ],
    ['缺少本次明确种子', emptyDraft, {}],
    ['未识别错误', { ...audioDraft, error_code: 'UNCLASSIFIED' }, entities]
  ]) {
    it(`不豁免${name}`, () => {
      assert.equal(classifyExpectedRejection(response, scope), null)
    })
  }
})

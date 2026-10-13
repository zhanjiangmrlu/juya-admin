export const /**
   * 将本次明确隔离草稿的音频状态门禁分类为可追溯的预期拒绝
   * @param response - 浏览器记录的 HTTP 方法、路径、状态与安全错误码
   * @param entities - 协调脚本创建的空草稿与尚无自动任务的音频草稿编号
   * @returns 精确命中的门禁原因，其它响应返回 null
   */ classifyExpectedRejection = (response, entities) => {
    if (response.method !== 'GET') return null
    const revisionId =
      /^\/api\/v1\/admin\/content\/revisions\/([0-9A-HJKMNP-TV-Z]{26})\/audio-production$/.exec(
        response.path
      )?.[1]
    if (!revisionId) return null
    if (
      revisionId === entities.revision_id &&
      response.status === 409 &&
      response.error_code === 'CANDIDATE_TEXT_REQUIRED'
    )
      return 'EMPTY_DRAFT_TEXT_REQUIRED'
    if (
      revisionId === entities.slice_revision_id &&
      response.status === 404 &&
      response.error_code === 'AUTO_AUDIO_NOT_FOUND'
    )
      return 'AUTO_AUDIO_TASK_NOT_CREATED'
    return null
  }

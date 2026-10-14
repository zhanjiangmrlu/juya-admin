export const /**
   * 读取已校验素材包模式
   * @param manifest - 服务端持久化清单
   * @param source - 管理员明确选择的入口
   * @returns 清单可证明的模式或未知
   */ materialMode = (
    manifest: Record<string, unknown>,
    source: string
  ): 'materials' | 'vocabulary' | 'unknown' => {
    if (
      manifest.has_vocabulary_table === true ||
      (Array.isArray(manifest.vocabulary_rows) && manifest.vocabulary_rows.length)
    )
      return 'vocabulary'
    if (manifest.has_vocabulary_table === false) return 'materials'
    return source === 'vocabulary' ? 'vocabulary' : 'unknown'
  }

export const /**
   * 计算真实清单与固定草稿范围的统计
   * @param resources - 当前素材包的完整文件集
   * @param type - 持久化内容模板
   * @param content - 明确读取的固定草稿，未读取时为空
   * @returns 已知统计与尚待核对的缺口
   */ materialStatistics = (
    resources: Record<string, unknown>[],
    type: string,
    content: Record<string, unknown> | null
  ) => {
    const /**
       * 读取完整候选数量而非截断的展示条数
       * @param row - 当前素材文件的匹配元数据
       * @returns 已记录候选数
       */ count = (row: Record<string, unknown>) =>
        typeof row.matching_candidate_count === 'number'
          ? row.matching_candidate_count
          : Array.isArray(row.matching_candidates)
            ? row.matching_candidates.length
            : 0
    const audio = resources.filter(
      (row) => row.kind === 'audio' || /\.(mp3|m4a|wav|aac)$/i.test(String(row.path))
    )
    return {
      clearAudio: audio.filter(
        (row) => count(row) === 1 && !row.ambiguous_title && !row.suggestions_truncated
      ).length,
      ambiguous: resources.filter((row) => count(row) > 1 || row.ambiguous_title).length,
      missingAudio: content ? (type === 'dialogue' && !content.audio ? 1 : 0) : null,
      // 明确模板下选填图片缺省不算异常，实际错误路径与解码错误仍独立呈现。
      optionalImageErrors: ['dialogue', 'word_card', 'short_reading'].includes(type) ? 0 : null
    }
  }

export const /**
   * 过滤模板允许的素材角色
   * @param roles - 服务端清单声明的资源角色
   * @param type - 当前固定模板
   * @returns 可以人工绑定的角色
   */ allowedMaterialRoles = (roles: string[], type: string): string[] =>
    roles.filter((role) =>
      type === 'short_reading'
        ? ['COVER_IMAGE', 'FULL_AUDIO'].includes(role)
        : [
            'COVER_IMAGE',
            'LEARNING_IMAGE',
            'WORD_IMAGE',
            'WORD_AUDIO',
            'CHUNK_AUDIO',
            ...(type === 'dialogue' ? ['WHOLE_AUDIO'] : [])
          ].includes(role)
    )

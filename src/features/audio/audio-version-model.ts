export interface AudioValidationResult {
  code: 'INVALID_AUDIO' | 'TOO_MANY_FILES' | null
  message: string
  valid: boolean
}

/**
 * 校验音频批次数量与文件扩展名
 *
 * @param files - 待上传音频文件
 * @returns 音频批次校验结果
 */
export function validateAudioBatch(files: readonly File[]): AudioValidationResult {
  if (files.length > 300)
    return { code: 'TOO_MANY_FILES', message: '单批最多上传 300 个音频', valid: false }
  const allowed = /\.(aac|m4a|mp3|wav)$/i
  if (files.some((file) => !allowed.test(file.name)))
    return { code: 'INVALID_AUDIO', message: '仅支持 MP3、M4A、WAV 和 AAC', valid: false }
  return { code: null, message: '校验通过', valid: true }
}

export interface AudioTarget {
  activeVersionId: null | string
  id: string
  stableKey: string
  targetType: string
}

export interface AudioVersion {
  assetId: string
  createdAt: string
  id: string
  source: string
  status: string
  targetId: string
  versionNo: number
}

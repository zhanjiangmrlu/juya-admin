export interface ImportFile {
  file: File
  seriesId: string
  templateId: string
}

export interface ValidationResult {
  code: 'EMPTY_BATCH' | 'INVALID_MIME' | 'MIXED_SERIES' | 'MIXED_TEMPLATE' | 'TOO_MANY_FILES' | null
  message: string
  valid: boolean
}

/**
 * 校验图片批次数量、格式、系列和模板一致性
 *
 * @param files - 带系列和模板信息的图片文件
 * @returns 批次校验结果
 */
export function validateImageBatch(files: readonly ImportFile[]): ValidationResult {
  if (files.length === 0) return invalid('EMPTY_BATCH', '请选择至少一张图片')
  if (files.length > 30) return invalid('TOO_MANY_FILES', '单批最多上传 30 张图片')
  if (files.some((item) => !['image/jpeg', 'image/png', 'image/webp'].includes(item.file.type)))
    return invalid('INVALID_MIME', '仅支持 JPG、PNG 和 WebP 图片')
  if (new Set(files.map((item) => item.seriesId)).size > 1)
    return invalid('MIXED_SERIES', '同一批图片必须属于同一系列')
  if (new Set(files.map((item) => item.templateId)).size > 1)
    return invalid('MIXED_TEMPLATE', '同一批图片必须使用同一模板')
  return { code: null, message: '校验通过', valid: true }
}

/**
 * 创建失败的批次校验结果
 *
 * @param code - 稳定错误码
 * @param message - 管理端提示文案
 * @returns 失败校验结果
 */
function invalid(code: Exclude<ValidationResult['code'], null>, message: string): ValidationResult {
  return { code, message, valid: false }
}

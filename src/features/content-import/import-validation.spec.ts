import { describe, expect, it } from 'vitest'

import { validateImageBatch } from './import-validation'

describe('image import validation', () => {
  it('rejects oversized and mixed image batches', () => {
    const thirtyOne = Array.from({ length: 31 }, (_, index) => image(`image-${index}.png`))
    expect(validateImageBatch(thirtyOne).valid).toBe(false)
    expect(validateImageBatch([image('a.png', 's1'), image('b.png', 's2')]).code).toBe(
      'MIXED_SERIES'
    )
    expect(validateImageBatch([image('a.png', 's1', 't1'), image('b.png', 's1', 't2')]).code).toBe(
      'MIXED_TEMPLATE'
    )
  })
})

/**
 * 创建用于导入校验的图片文件
 *
 * @param name - 图片文件名
 * @param seriesId - 所属系列编号
 * @param templateId - 使用的模板编号
 * @returns 包含文件和归属信息的图片条目
 */
function image(name: string, seriesId = 's1', templateId = 't1') {
  return { file: new File(['x'], name, { type: 'image/png' }), seriesId, templateId }
}

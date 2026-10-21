import { mediaURL } from './display'

/** 按展示用途选择素材编号，默认只用缩略图，缺失时不提前下载原图
 * @param thumbnailId 当前展示版本已有的缩略图编号
 * @param originalId 当前展示版本的原图编号
 * @param original 用户明确查看大图时才选择原图
 * @returns 当前展示用途对应的素材编号或空值
 */
export const sceneImageId = (
  thumbnailId?: string | null,
  originalId?: string | null,
  original = false
): string => (original ? originalId : thumbnailId) || ''

/** 仅为列表缩略图追加受控压缩参数，原图查看继续使用原始地址
 * @param id 当前展示版本的缩略图素材编号
 * @param attempt 用户手动重试小图的次数
 * @returns 列表专用小图地址
 */
export const sceneThumbnailURL = (id?: string | null, attempt = 0): string => {
  const source = mediaURL(id)
  if (!source) return ''
  const query = new URLSearchParams({ thumbnail: 'list' })
  if (attempt) query.set('retry', String(attempt))
  return `${source}?${query}`
}

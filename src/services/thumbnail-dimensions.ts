import { THUMBNAIL_MAX_HEIGHT, THUMBNAIL_MAX_WIDTH } from '@/shared/constants/media'

/** 保持完整图片比例缩小到展示上限，不放大小尺寸原图
 * @param width 已解码原图的实际像素宽度
 * @param height 已解码原图的实际像素高度
 * @returns 等比缩放后的缩略图像素尺寸
 */
export const thumbnailDimensions = (width: number, height: number) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('原图尺寸无效')
  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width, THUMBNAIL_MAX_HEIGHT / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

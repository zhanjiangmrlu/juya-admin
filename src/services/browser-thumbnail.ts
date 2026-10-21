import { THUMBNAIL_QUALITY } from '@/shared/constants/media'

import type { GeneratedThumbnail } from '@/shared/types/media'

import { thumbnailDimensions } from './thumbnail-dimensions'

/** 在浏览器中解码受控原图并输出真正缩小后的 JPEG，兼容后台 Cookie 资源
 * @param url 已授权的原图地址
 * @returns 独立的缩略图数据与原图地址
 */
export const createBrowserThumbnail = (url: string): Promise<GeneratedThumbnail> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'use-credentials'
    image.onload = () => {
      try {
        const size = thumbnailDimensions(image.naturalWidth, image.naturalHeight),
          canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('图片处理暂不可用')
        context.drawImage(image, 0, 0, size.width, size.height)
        resolve({
          thumbnailSrc: canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY / 100),
          originalSrc: url
        })
      } catch {
        reject(new Error('缩略图生成失败，可重试'))
      }
    }
    image.onerror = () => reject(new Error('原图加载失败，可重试'))
    image.src = url
  })

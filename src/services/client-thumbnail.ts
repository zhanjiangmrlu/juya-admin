import { THUMBNAIL_CACHE_LIFETIME_MS, THUMBNAIL_CACHE_LIMIT } from '@/shared/constants/media'

import type { GeneratedThumbnail, ThumbnailCacheEntry } from '@/shared/types/media'

import { createBrowserThumbnail } from './browser-thumbnail'

const thumbnails = new Map<string, ThumbnailCacheEntry>()
let generation = 0

/** 账号退出或切换时清除内存缩略图，不持久化账号图片 */
export const clearClientThumbnails = () => {
  generation++
  thumbnails.clear()
}

/** 按账号、卡片版本和原图标识复用前端缩略图，合并并发处理
 * @param key 调用方提供的当前账号与图片版本缓存标识
 * @param loadOriginal 延迟获取当前授权原图地址
 * @param renew 用户重试时强制重新下载和处理
 * @returns 与完整原图分开的缩略图资源
 */
export const clientThumbnail = (
  key: string,
  loadOriginal: () => Promise<string>,
  renew = false
): Promise<GeneratedThumbnail> => {
  const existing = thumbnails.get(key)
  if (!renew && existing && Date.now() - existing.created < THUMBNAIL_CACHE_LIFETIME_MS)
    return existing.result
  const run = generation
  const entry: ThumbnailCacheEntry = {
    created: Date.now(),
    result: loadOriginal()
      .then(async (url) => {
        if (run !== generation) throw new Error('账号状态已变化')
        const result = await createBrowserThumbnail(url)
        if (run !== generation) throw new Error('账号状态已变化')
        return result
      })
      .catch((reason: unknown) => {
        if (thumbnails.get(key) === entry) thumbnails.delete(key)
        throw reason
      })
  }
  thumbnails.delete(key)
  thumbnails.set(key, entry)
  if (thumbnails.size > THUMBNAIL_CACHE_LIMIT) thumbnails.delete(thumbnails.keys().next().value!)
  return entry.result
}

export interface ProcessingMedia {
  id: string
  state: string
}
export interface GeneratedThumbnail {
  thumbnailSrc: string
  originalSrc: string
}
export interface ThumbnailCacheEntry {
  created: number
  result: Promise<GeneratedThumbnail>
}
export interface UploadProgress {
  loaded: number
  total: number | null
  percent: number | null
}
export interface MediaWaitOptions {
  active: () => boolean
  pause?: () => Promise<void>
  checks?: number
}

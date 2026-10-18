export interface ProcessingMedia {
  id: string
  state: string
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

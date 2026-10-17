export interface ProcessingMedia {
  id: string
  state: string
}
export interface MediaWaitOptions {
  active: () => boolean
  pause?: () => Promise<void>
  checks?: number
}

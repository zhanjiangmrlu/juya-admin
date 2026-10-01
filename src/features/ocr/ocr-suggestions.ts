export interface OcrLine {
  id: number
  text: string
  location: Record<string, number> | null
  confidence: number | null
  low_confidence: boolean
  paragraph: Record<string, unknown> | null
}
export interface OcrGroup {
  field: 'title' | 'dialogue' | 'vocabulary' | 'chunks'
  label: string
  line_ids: number[]
  reason: string
}
export interface OcrSuggestions {
  template_type: string
  lines: OcrLine[]
  groups: OcrGroup[]
  unassigned_line_ids: number[]
  low_confidence_threshold: number
}

import type { components } from '@/shared/contracts/generated/admin-api'
import type { PronunciationReference } from '@/shared/types/pronunciation'
export type ScenePronunciationContext = {
  reference: PronunciationReference
} & (
  | { cardId: string; import?: never }
  | { cardId?: never; import: { batchId: string; itemId: string } }
)
export interface SceneReaderProps {
  content: components['schemas']['SceneContent']
  pronunciation?: ScenePronunciationContext
}

export interface WordPronunciationState {
  current: string
  status: string
  error: string
}

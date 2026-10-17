import type { components } from '@/shared/contracts/generated/admin-api'
import type { PronunciationReference } from '@/shared/types/pronunciation'
export interface ScenePronunciationContext {
  cardId: string
  reference: PronunciationReference
}
export interface SceneReaderProps {
  content: components['schemas']['SceneContent']
  pronunciation?: ScenePronunciationContext
}

export interface WordPronunciationState {
  current: string
  status: string
  error: string
}

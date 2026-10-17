import type { components } from '@/shared/contracts/generated/admin-api'
export type PronunciationState = components['schemas']['SpeechState']
export type PronunciationReference = components['schemas']['SpeechReference']
export interface PronunciationPorts {
  request: (
    method: 'GET' | 'POST',
    path: string,
    reference: PronunciationReference
  ) => Promise<PronunciationState>
  pause: () => Promise<void>
  active: () => boolean
}

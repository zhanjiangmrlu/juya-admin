import type { components } from '@/shared/contracts/generated/admin-api'
export interface BatchPublicationProps {
  cardIds?: string[]
  batchId?: string
}
export interface PublicationCheck {
  id: string
  name: string
  category: 'ready' | 'incomplete' | 'unchanged' | 'error'
  reason: string
  card?: components['schemas']['CardView']
  preview?: components['schemas']['CardPreview']
}

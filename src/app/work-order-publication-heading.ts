import type { InjectionKey } from 'vue'

export interface WorkOrderPublicationHeading {
  routePath: string
  workOrderId: string
  title: string
  description: string
}

export type SetWorkOrderPublicationHeading = (
  owner: symbol,
  heading: WorkOrderPublicationHeading | null
) => void

export const workOrderPublicationHeadingKey: InjectionKey<SetWorkOrderPublicationHeading> = Symbol(
  'work-order-publication-heading'
)

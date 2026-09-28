import type { CapabilityKey } from '@/shared/capabilities/capability-registry'

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    capability?: CapabilityKey
    navigationPath?: string
    pageNumber?: string
    public?: boolean
    sensitive?: boolean
    title?: string
  }
}

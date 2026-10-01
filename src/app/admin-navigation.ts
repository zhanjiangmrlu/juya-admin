import type { CapabilityKey } from '@/shared/capabilities/capability-registry'

export type NavigationIcon =
  | 'analytics'
  | 'campaigns'
  | 'content'
  | 'dashboard'
  | 'entitlements'
  | 'feedback'
  | 'settings'
  | 'users'
  | 'work-items'

export interface NavigationItem {
  icon: NavigationIcon
  label: string
  path: string
}

export interface NavigationPage {
  label: string
  pageNumber: string
  path: string
}

export interface NavigationGroup extends NavigationItem {
  pages: readonly NavigationPage[]
}

export interface AdminPageDefinition {
  capability: CapabilityKey
  name: string
  navigationPath: string
  pageNumber: string
  path: string
  sensitive?: boolean
  title: string
}

export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  { icon: 'dashboard', label: '工作台', path: '/dashboard' },
  { icon: 'users', label: '用户管理', path: '/users' },
  { icon: 'entitlements', label: '统一权益中心', path: '/entitlements' },
  { icon: 'campaigns', label: '限时活动配置', path: '/campaigns' },
  { icon: 'work-items', label: '消息中心', path: '/work-items' },
  { icon: 'feedback', label: '问题反馈', path: '/feedback' }
]

export const BASIC_NAVIGATION: readonly NavigationItem[] = [
  { icon: 'content', label: '内容生产', path: '/content/scenes' },
  { icon: 'settings', label: '系统配置', path: '/settings' },
  { icon: 'analytics', label: '汇总统计', path: '/analytics' }
]

export const ADMIN_PAGE_DEFINITIONS: readonly AdminPageDefinition[] = [
  {
    capability: 'dashboard.read',
    name: 'dashboard',
    navigationPath: '/dashboard',
    pageNumber: 'A01',
    path: '/dashboard',
    title: '工作台'
  },
  {
    capability: 'users.list',
    name: 'users',
    navigationPath: '/users',
    pageNumber: 'A02',
    path: '/users',
    sensitive: true,
    title: '用户管理'
  },
  {
    capability: 'users.detail',
    name: 'user-detail',
    navigationPath: '/users',
    pageNumber: 'A03',
    path: '/users/:userId',
    sensitive: true,
    title: '用户详情'
  },
  {
    capability: 'contacts.correction-command',
    name: 'contact-correction',
    navigationPath: '/users',
    pageNumber: 'A04',
    path: '/contacts/corrections/:id',
    sensitive: true,
    title: '联系资料更正处理'
  },
  {
    capability: 'entitlements.list',
    name: 'entitlements',
    navigationPath: '/entitlements',
    pageNumber: 'A05',
    path: '/entitlements',
    sensitive: true,
    title: '统一权益中心'
  },
  {
    capability: 'entitlements.formal-command',
    name: 'formal-entitlement-grant',
    navigationPath: '/entitlements',
    pageNumber: 'A06',
    path: '/entitlements/formal/grant',
    sensitive: true,
    title: '授予正式内容包'
  },
  {
    capability: 'entitlements.limited-command',
    name: 'limited-entitlement-grant',
    navigationPath: '/entitlements',
    pageNumber: 'A07',
    path: '/entitlements/limited/grant',
    sensitive: true,
    title: '开通限时学习权益'
  },
  {
    capability: 'entitlements.formal-command',
    name: 'formal-entitlement-action',
    navigationPath: '/entitlements',
    pageNumber: 'A08',
    path: '/entitlements/formal/:id/action',
    sensitive: true,
    title: '正式权益操作'
  },
  {
    capability: 'entitlements.limited-command',
    name: 'limited-entitlement-action',
    navigationPath: '/entitlements',
    pageNumber: 'A09',
    path: '/entitlements/limited/:id/action',
    sensitive: true,
    title: '限时权益操作'
  },
  {
    capability: 'campaigns.manage',
    name: 'campaigns',
    navigationPath: '/campaigns',
    pageNumber: 'A10',
    path: '/campaigns',
    title: '限时活动列表'
  },
  {
    capability: 'campaigns.manage',
    name: 'campaign-edit',
    navigationPath: '/campaigns',
    pageNumber: 'A11',
    path: '/campaigns/:id/edit',
    title: '限时活动编辑'
  },
  {
    capability: 'campaigns.capacity',
    name: 'campaign-versions',
    navigationPath: '/campaigns',
    pageNumber: 'A12',
    path: '/campaigns/:id/versions',
    title: '活动版本与容量'
  },
  {
    capability: 'work-items.list',
    name: 'work-items',
    navigationPath: '/work-items',
    pageNumber: 'A13',
    path: '/work-items',
    title: '消息中心'
  },
  {
    capability: 'feedback.list',
    name: 'feedback',
    navigationPath: '/feedback',
    pageNumber: 'A14',
    path: '/feedback',
    sensitive: true,
    title: '问题反馈列表'
  },
  {
    capability: 'feedback.detail',
    name: 'feedback-detail',
    navigationPath: '/feedback',
    pageNumber: 'A15',
    path: '/feedback/:id',
    sensitive: true,
    title: '问题反馈详情'
  },
  {
    capability: 'feedback.command',
    name: 'feedback-respond',
    navigationPath: '/feedback',
    pageNumber: 'A16',
    path: '/feedback/:id/respond',
    sensitive: true,
    title: '反馈回复与关闭'
  },
  {
    capability: 'content.list',
    name: 'content-scenes',
    navigationPath: '/content/scenes',
    pageNumber: 'A17',
    path: '/content/scenes',
    title: '内容列表'
  },
  {
    capability: 'content.upload',
    name: 'content-import',
    navigationPath: '/content/scenes',
    pageNumber: 'A18',
    path: '/content/import',
    title: '批量上传与 OCR'
  },
  {
    capability: 'content.ocr',
    name: 'content-ocr',
    navigationPath: '/content/scenes',
    pageNumber: 'A19',
    path: '/content/ocr/:taskId/:itemId',
    title: 'OCR 校对'
  },
  {
    capability: 'content.edit',
    name: 'content-scene-edit',
    navigationPath: '/content/scenes',
    pageNumber: 'A20',
    path: '/content/scenes/:id/edit',
    title: '结构化场景编辑'
  },
  {
    capability: 'content.edit',
    name: 'content-scene-audio',
    navigationPath: '/content/scenes',
    pageNumber: 'A21',
    path: '/content/scenes/:id/audio',
    title: '音频版本管理'
  },
  {
    capability: 'content.publish',
    name: 'content-scene-publish',
    navigationPath: '/content/scenes',
    pageNumber: 'A22',
    path: '/content/scenes/:id/publish',
    title: '发布检查与发布'
  },
  {
    capability: 'content.discovery-config',
    name: 'content-discovery-config',
    navigationPath: '/content/scenes',
    pageNumber: 'A23',
    path: '/content/discovery-config',
    title: '发现页配置'
  },
  {
    capability: 'content.batch-jobs',
    name: 'content-jobs',
    navigationPath: '/content/scenes',
    pageNumber: 'A24',
    path: '/content/jobs',
    title: '批量任务中心'
  },
  {
    capability: 'analytics.query',
    name: 'analytics',
    navigationPath: '/analytics',
    pageNumber: 'A25',
    path: '/analytics',
    title: '汇总统计'
  },
  {
    capability: 'settings.read',
    name: 'settings',
    navigationPath: '/settings',
    pageNumber: 'A26',
    path: '/settings',
    title: '系统配置'
  }
]

/**
 * 将顶级导航项与无需业务对象参数的页面组合为菜单分组
 *
 * @param items - 顶级导航项
 * @returns 包含子页面的导航分组
 */
function createNavigationGroups(items: readonly NavigationItem[]): readonly NavigationGroup[] {
  return items.map((item) => ({
    ...item,
    pages: ADMIN_PAGE_DEFINITIONS.filter(
      (page) => page.navigationPath === item.path && !page.path.includes(':')
    ).map((page) => ({
      label: page.title,
      pageNumber: page.pageNumber,
      path: page.path
    }))
  }))
}

export const PRIMARY_NAVIGATION_GROUPS = createNavigationGroups(PRIMARY_NAVIGATION)
export const BASIC_NAVIGATION_GROUPS = createNavigationGroups(BASIC_NAVIGATION)
export const ADMIN_NAVIGATION_GROUPS = [
  ...PRIMARY_NAVIGATION_GROUPS,
  ...BASIC_NAVIGATION_GROUPS
] as const

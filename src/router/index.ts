import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { ADMIN_PAGE_DEFINITIONS } from '@/app/admin-navigation'

const adminPageRoutes: RouteRecordRaw[] = ADMIN_PAGE_DEFINITIONS.map((page) => ({
  component: resolveAdminPageComponent(page.name),
  meta: {
    capability: page.capability,
    navigationPath: page.navigationPath,
    pageNumber: page.pageNumber,
    sensitive: page.sensitive ?? false,
    title: page.title
  },
  name: page.name,
  path: page.path.slice(1)
}))

/**
 * 将页面定义名称解析为对应的懒加载页面组件
 *
 * @param name - 管理端页面定义名称
 * @returns 对应页面的异步组件；尚未实现时返回能力占位页
 */
function resolveAdminPageComponent(
  name: string
): Exclude<RouteRecordRaw['component'], null | undefined> {
  const pageComponents = {
    analytics: () => import('@/pages/analytics/analytics-page.vue'),
    'campaign-edit': () => import('@/pages/campaigns/campaign-edit-page.vue'),
    'campaign-versions': () => import('@/pages/campaigns/campaign-version-page.vue'),
    campaigns: () => import('@/pages/campaigns/campaign-list-page.vue'),
    'contact-correction': () => import('@/pages/contacts/contact-correction-page.vue'),
    'content-scenes': () => import('@/pages/content/content-list-page.vue'),
    'content-import': () => import('@/pages/content/content-import-page.vue'),
    'content-ocr': () => import('@/pages/content/ocr-review-page.vue'),
    'content-scene-audio': () => import('@/pages/content/audio-version-page.vue'),
    'content-scene-edit': () => import('@/pages/content/scene-editor-page.vue'),
    'content-scene-publish': () => import('@/pages/content/publish-check-page.vue'),
    'content-discovery-config': () => import('@/pages/content/discovery-config-page.vue'),
    'content-jobs': () => import('@/pages/content/batch-jobs-page.vue'),
    dashboard: () => import('@/pages/dashboard/dashboard-page.vue'),
    entitlements: () => import('@/pages/entitlements/entitlement-center-page.vue'),
    feedback: () => import('@/pages/feedback/feedback-list-page.vue'),
    'feedback-detail': () => import('@/pages/feedback/feedback-detail-page.vue'),
    'feedback-respond': () => import('@/pages/feedback/feedback-respond-page.vue'),
    'formal-entitlement-action': () => import('@/pages/entitlements/formal-action-page.vue'),
    'formal-entitlement-grant': () => import('@/pages/entitlements/formal-grant-page.vue'),
    'limited-entitlement-action': () => import('@/pages/entitlements/limited-action-page.vue'),
    'limited-entitlement-grant': () => import('@/pages/entitlements/limited-grant-page.vue'),
    settings: () => import('@/pages/settings/settings-page.vue'),
    'user-detail': () => import('@/pages/users/user-detail-page.vue'),
    users: () => import('@/pages/users/user-list-page.vue'),
    'work-items': () => import('@/pages/work-items/work-item-page.vue')
  }
  if (name in pageComponents) return pageComponents[name as keyof typeof pageComponents]
  return () => import('@/pages/capability-placeholder/capability-placeholder-page.vue')
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      component: () => import('@/pages/login/login-page.vue'),
      meta: { public: true, title: '管理员登录' },
      name: 'login',
      path: '/login'
    },
    {
      component: () => import('@/layouts/admin-layout/admin-layout.vue'),
      path: '/',
      redirect: { name: 'dashboard' },
      children: adminPageRoutes
    }
  ]
})

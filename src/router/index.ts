import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { ADMIN_PAGE_DEFINITIONS } from '@/app/admin-navigation'

const adminPageRoutes: RouteRecordRaw[] = ADMIN_PAGE_DEFINITIONS.map((page) => ({
  component:
    page.name === 'dashboard'
      ? () => import('@/pages/dashboard/dashboard-page.vue')
      : page.name === 'users'
        ? () => import('@/pages/users/user-list-page.vue')
        : page.name === 'user-detail'
          ? () => import('@/pages/users/user-detail-page.vue')
          : page.name === 'contact-correction'
            ? () => import('@/pages/contacts/contact-correction-page.vue')
            : () => import('@/pages/capability-placeholder/capability-placeholder-page.vue'),
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

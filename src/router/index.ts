import { createRouter, createWebHistory } from 'vue-router'

import { useAdminStore } from '@/stores/admin-store'
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    return saved || (to.path === from.path ? undefined : { top: 0 })
  },
  routes: [
    { path: '/login', component: () => import('@/pages/login/login-page.vue') },
    { path: '/', redirect: '/cards' },
    {
      path: '/cards',
      component: () => import('@/pages/scenes/scene-list-page.vue'),
      meta: { title: '卡片管理' }
    },
    {
      path: '/cards/:id',
      component: () => import('@/pages/scenes/scene-edit-page.vue'),
      meta: { title: '卡片编辑' }
    },
    {
      path: '/users',
      component: () => import('@/pages/users/user-list-page.vue'),
      meta: { title: '用户管理' }
    },
    {
      path: '/users/:id',
      component: () => import('@/pages/users/user-detail-page.vue'),
      meta: { title: '用户详情' }
    },
    {
      path: '/statistics',
      component: () => import('@/pages/statistics/statistics-page.vue'),
      meta: { title: '数据统计' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/cards' }
  ]
})
router.beforeEach(async (to) => {
  if (to.path === '/login') return true
  const admin = useAdminStore()
  try {
    if (!admin.checked) await admin.resume()
  } catch {
    return { path: '/login', query: { return: to.fullPath } }
  }
  return admin.identity ? true : { path: '/login', query: { return: to.fullPath } }
})
export default router

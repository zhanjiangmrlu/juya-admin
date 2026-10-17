<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import { requestLogoutPermission } from '@/services/logout-guard'
import { useAdminStore } from '@/stores/admin-store'
const route = useRoute(),
  router = useRouter(),
  admin = useAdminStore(),
  error = ref('')
const navigation = [
  { to: '/cards', label: '卡片管理', icon: 'cards' },
  { to: '/users', label: '用户管理', icon: 'users' },
  { to: '/statistics', label: '数据统计', icon: 'chart' }
]
/** 清理敏感页面后返回登录 */
const expired = () => {
  admin.clear()
  void router.replace({ path: '/login', query: { return: route.fullPath } })
}
const logoutBusy = ref(false)
/** 先确认离开，注销失败时保留会话并展示错误 */
const logout = async () => {
  if (logoutBusy.value) return
  logoutBusy.value = true
  try {
    if (!(await requestLogoutPermission())) return
    await admin.logout()
    await router.replace('/login')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '退出失败，请重试'
  } finally {
    logoutBusy.value = false
  }
}
window.addEventListener('admin-session-expired', expired)
onBeforeUnmount(() => window.removeEventListener('admin-session-expired', expired))
</script>
<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else-if="admin.identity" class="admin-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/cards"
        ><AppIcon :size="28" /><strong>句芽英语</strong><small>内容管理后台</small></RouterLink
      >
      <nav aria-label="业务导航">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          :class="{ active: route.path.startsWith(item.to) }"
          ><AppIcon :name="item.icon" />{{ item.label }}</RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <p>{{ admin.identity.username }}</p>
        <button type="button" class="text" :disabled="logoutBusy" @click="logout">退出登录</button>
        <p class="muted small">句芽英语 · 场景学习</p>
      </div>
    </aside>
    <div class="workspace">
      <header class="workspace-bar">
        <span>{{ route.meta.title }}</span
        ><span class="muted">管理后台</span>
      </header>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <main class="page">
        <RouterView v-slot="{ Component }"
          ><KeepAlive :include="['SceneListPage', 'UserListPage']"
            ><component :is="Component" /></KeepAlive
        ></RouterView>
      </main>
    </div>
  </div>
</template>

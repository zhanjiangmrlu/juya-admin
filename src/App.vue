<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppBrand from '@/components/app-brand/app-brand.vue'
import AppIcon from '@/components/app-icon/app-icon.vue'
import { installAudioFocus } from '@/services/audio-focus'
import { requestLogoutPermission } from '@/services/logout-guard'
import { useAdminStore } from '@/stores/admin-store'
const route = useRoute(),
  router = useRouter(),
  admin = useAdminStore(),
  error = ref('')
const releaseAudioFocus = installAudioFocus()
onBeforeUnmount(releaseAudioFocus)
const navigation = [
  { to: '/cards', label: '场景卡片', icon: 'cards' },
  { to: '/listening', label: '听读管理', icon: 'listening' },
  { to: '/imports', label: '批量导入', icon: 'upload' },
  { to: '/users', label: '用户管理', icon: 'users' },
  { to: '/statistics', label: '数据统计', icon: 'chart' },
  { to: '/feedback', label: '问题反馈', icon: 'feedback' }
]
// 保持后台跨北京时间零点后的日期与当前时间一致
const clock = ref(Date.now())
const dateTimer = window.setInterval(() => {
  clock.value = Date.now()
}, 60_000)
onBeforeUnmount(() => window.clearInterval(dateTimer))
const headerDate = computed(() =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(clock.value)
)
const breadcrumb = computed(() => {
  const current = String(route.meta.title || '')
  if (route.path.startsWith('/listening/'))
    return current === '听读管理'
      ? current
      : `听读管理 / ${route.params.id === 'new' ? '新建文章' : current}`
  if (route.path.startsWith('/users/')) return `用户管理 / ${current}`
  if (route.path.startsWith('/cards/')) return `场景卡片 / ${current}`
  return route.path === '/cards' ? '场景卡片' : route.path === '/users' ? '用户管理' : current
})
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
      <RouterLink class="brand" to="/cards"><AppBrand /><small>内容管理后台</small></RouterLink>
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
        <p>{{ admin.identity.username === 'admin' ? '管理员' : admin.identity.username }}</p>
        <button type="button" class="text" :disabled="logoutBusy" @click="logout">退出登录</button>
      </div>
    </aside>
    <div class="workspace">
      <header class="workspace-bar">
        <span>{{ breadcrumb }}</span
        ><span class="muted">{{ headerDate }} 内容管理员</span>
      </header>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <main class="page">
        <RouterView v-slot="{ Component }"
          ><KeepAlive
            :include="['SceneListPage', 'ListeningListPage', 'UserListPage', 'FeedbackListPage']"
            ><component :is="Component" /></KeepAlive
        ></RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Bell,
  Calendar,
  ChatLineSquare,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  House,
  Reading,
  Setting,
  Tickets,
  User,
  UserFilled
} from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { BASIC_NAVIGATION, PRIMARY_NAVIGATION } from '@/app/admin-navigation'
import { useAuthStore } from '@/features/auth/auth-store'

const navigationIconMap = {
  analytics: DataAnalysis,
  campaigns: Calendar,
  content: Document,
  dashboard: House,
  entitlements: Tickets,
  feedback: ChatLineSquare,
  settings: Setting,
  users: User,
  'work-items': Bell
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isCollapsed = ref(false)
const activeNavigationPath = computed(() => String(route.meta.navigationPath ?? route.path))

/**
 * 切换管理端侧栏折叠状态
 *
 * @returns 无返回值
 */
function toggleAside(): void {
  isCollapsed.value = !isCollapsed.value
}

/**
 * 注销当前管理员并跳转登录页
 *
 * @returns 退出流程完成后的 Promise
 */
async function logout(): Promise<void> {
  await authStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <ElContainer class="admin-layout">
    <ElAside
      class="aside"
      :class="{ collapsed: isCollapsed }"
      :width="isCollapsed ? '72px' : 'var(--juya-sidebar-width)'"
    >
      <div class="brand">
        <span class="logo"
          ><ElIcon><Reading /></ElIcon
        ></span>
        <div v-if="!isCollapsed" class="brand-copy">
          <strong>句芽英语</strong>
          <span>单管理员后台</span>
        </div>
      </div>

      <ElMenu class="menu" :collapse="isCollapsed" :default-active="activeNavigationPath" router>
        <ElMenuItem v-for="item in PRIMARY_NAVIGATION" :key="item.path" :index="item.path">
          <ElIcon><component :is="navigationIconMap[item.icon]" /></ElIcon>
          <template #title>{{ item.label }}</template>
        </ElMenuItem>

        <li v-if="!isCollapsed" class="section-label" role="presentation">基础能力</li>

        <ElMenuItem v-for="item in BASIC_NAVIGATION" :key="item.path" :index="item.path">
          <ElIcon><component :is="navigationIconMap[item.icon]" /></ElIcon>
          <template #title>{{ item.label }}</template>
        </ElMenuItem>
      </ElMenu>
    </ElAside>

    <ElContainer class="workspace">
      <ElHeader class="header">
        <div class="title-group">
          <ElButton
            :aria-label="isCollapsed ? '展开侧栏' : '折叠侧栏'"
            circle
            text
            @click="toggleAside"
          >
            <ElIcon><Expand v-if="isCollapsed" /><Fold v-else /></ElIcon>
          </ElButton>
          <h1 class="title">{{ route.meta.title }}</h1>
        </div>

        <ElDropdown trigger="click">
          <button class="admin" type="button">
            <span class="admin-badge">管理员 · 已认证</span>
            <span class="avatar"
              ><ElIcon><UserFilled /></ElIcon
            ></span>
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem @click="logout">退出登录</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </ElHeader>

      <ElMain class="main">
        <RouterView />
      </ElMain>
    </ElContainer>
  </ElContainer>
</template>

<style scoped lang="scss">
.admin-layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--juya-color-page);

  .aside {
    overflow-x: hidden;
    background: var(--juya-color-sidebar);
    transition: width 180ms ease;
  }

  .brand {
    display: flex;
    height: var(--juya-header-height);
    align-items: center;
    gap: 12px;
    padding: 0 18px;
    color: #fff;
  }

  .logo {
    display: grid;
    flex: 0 0 48px;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #f7f5eb;
    color: var(--juya-color-sidebar);
    font-size: 25px;
    place-items: center;
  }

  .brand-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
    white-space: nowrap;
  }

  .brand-copy strong {
    font-size: 16px;
  }

  .brand-copy span {
    color: rgb(255 255 255 / 62%);
    font-size: 11px;
  }

  .menu {
    width: 100%;
    border-right: 0;
    background: transparent;
  }

  .section-label {
    padding: 24px 26px 10px;
    color: rgb(255 255 255 / 66%);
    font-size: 11px;
    letter-spacing: 0.08em;
    list-style: none;
  }

  .workspace {
    min-width: 0;
  }

  .header {
    display: flex;
    height: var(--juya-header-height);
    flex: 0 0 var(--juya-header-height);
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--juya-color-border);
    background: var(--juya-color-surface);
    padding-inline: 24px;
  }

  .title-group,
  .admin {
    display: flex;
    align-items: center;
  }

  .title-group {
    gap: 10px;
  }

  .title {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 20px;
  }

  .admin {
    gap: 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .admin-badge {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--juya-color-primary-soft);
    color: var(--juya-color-primary-hover);
    font-size: 12px;
    font-weight: 600;
  }

  .avatar {
    display: grid;
    width: 40px;
    height: 40px;
    border: 1px solid var(--juya-color-border-light);
    border-radius: 50%;
    background: #fbfaf6;
    color: var(--juya-color-primary);
    place-items: center;
  }

  .main {
    min-width: 0;
    overflow: auto;
    padding: 22px 24px 32px;
  }

  .menu.el-menu {
    --el-menu-bg-color: transparent;
    --el-menu-text-color: rgb(255 255 255 / 72%);
    --el-menu-hover-bg-color: var(--juya-color-sidebar-hover);
    --el-menu-active-color: var(--juya-color-primary);
  }

  .menu .el-menu-item {
    height: 44px;
    margin: 4px 14px;
    border-radius: 8px;
    padding-inline: 12px;
  }

  .menu .is-active {
    background: #fbfcfb;
    font-weight: 600;
  }
}
</style>

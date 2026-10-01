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

import { ADMIN_NAVIGATION_GROUPS } from '@/app/admin-navigation'
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
const navigationPages = ADMIN_NAVIGATION_GROUPS.flatMap((item) => item.pages)
const activePageNumber = computed(() => {
  const currentPageNumber = String(route.meta.pageNumber ?? '')
  const currentPage = navigationPages.find((page) => page.pageNumber === currentPageNumber)
  if (currentPage) return currentPage.pageNumber
  return navigationPages.find((page) => page.path === route.meta.navigationPath)?.pageNumber ?? ''
})
const defaultOpenGroups = ADMIN_NAVIGATION_GROUPS.filter((item) => item.pages.length > 1).map(
  (item) => item.path
)

/**
 * 从 Element Plus 菜单切换到无需业务上下文的页面
 *
 * @param pageNumber - 被选中的 A01-A26 页面编号
 * @returns 路由切换完成后的 Promise
 */
async function navigateToPage(pageNumber: string): Promise<void> {
  const page = navigationPages.find((item) => item.pageNumber === pageNumber)
  if (!page) return
  await router.push(page.path)
}

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

      <ElScrollbar
        aria-label="后台功能导航"
        class="menu-scrollbar"
        :always="true"
        :tabindex="0"
        wrap-class="menu-scrollbar-wrap"
      >
        <ElMenu
          class="menu"
          :collapse="isCollapsed"
          :default-active="activePageNumber"
          :default-openeds="defaultOpenGroups"
          @select="navigateToPage"
        >
          <template v-for="(group, groupIndex) in ADMIN_NAVIGATION_GROUPS" :key="group.path">
            <li v-if="groupIndex === 6 && !isCollapsed" class="section-label" role="presentation">
              基础能力
            </li>
            <ElMenuItem
              v-if="group.pages.length === 1"
              :aria-label="group.label"
              class="top-level-item"
              :index="group.pages[0]?.pageNumber"
            >
              <ElIcon><component :is="navigationIconMap[group.icon]" /></ElIcon>
              <template #title>{{ group.label }}</template>
            </ElMenuItem>
            <ElSubMenu v-else :index="group.path">
              <template #title>
                <ElIcon><component :is="navigationIconMap[group.icon]" /></ElIcon>
                <span>{{ group.label }}</span>
              </template>
              <ElMenuItemGroup>
                <ElMenuItem
                  v-for="page in group.pages"
                  :key="page.pageNumber"
                  :index="page.pageNumber"
                  :title="page.label"
                >
                  <span class="page-number">{{ page.pageNumber }}</span>
                  <span class="page-label">{{ page.label }}</span>
                </ElMenuItem>
              </ElMenuItemGroup>
            </ElSubMenu>
          </template>
        </ElMenu>
      </ElScrollbar>
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
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    background: var(--juya-color-sidebar);
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

  .menu-scrollbar {
    --el-scrollbar-bg-color: rgb(255 255 255 / 32%);
    --el-scrollbar-hover-bg-color: rgb(255 255 255 / 46%);
    --el-scrollbar-hover-opacity: 1;
    --el-scrollbar-opacity: 1;

    flex: 1;
    min-height: 0;
    width: 100%;
  }

  :deep(.menu-scrollbar-wrap) {
    overflow-x: hidden;
  }

  :deep(.menu-scrollbar-wrap:focus-visible) {
    outline: 2px solid var(--juya-color-brand-accent);
    outline-offset: -2px;
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
    --juya-main-margin-block: 40px;

    min-width: 0;
    overflow: auto;
    padding: var(--juya-main-padding-top) var(--juya-main-padding-inline)
      var(--juya-main-padding-bottom);
    background: #fff;
    margin: 20px;
    border-radius: 5px;
  }

  .menu.el-menu {
    --el-menu-bg-color: transparent;
    --el-menu-text-color: rgb(255 255 255 / 72%);
    --el-menu-hover-bg-color: var(--juya-color-sidebar-hover);
    --el-menu-active-color: var(--juya-color-primary);
  }

  .menu :deep(.el-menu) {
    background: transparent;
  }

  /* stylelint-disable-next-line selector-class-pattern -- Element Plus 外部组件类名 */
  .menu :deep(.el-sub-menu__title) {
    height: 44px;
    margin: 4px 14px;
    border-radius: 8px;
    padding-inline: 12px;
  }

  /* stylelint-disable-next-line selector-class-pattern -- Element Plus 外部组件类名 */
  .menu :deep(.el-sub-menu__title:hover) {
    background: var(--juya-color-sidebar-hover);
  }

  .menu :deep(.el-menu-item) {
    height: 36px;
    margin: 2px 14px 2px 24px;
    border-radius: 6px;
    padding-inline: 12px;
  }

  .menu :deep(.el-menu-item.top-level-item) {
    height: 44px;
    margin: 4px 14px;
    border-radius: 8px;
    padding-inline: 12px;
  }

  .menu :deep(.el-menu-item.is-active) {
    background: #fbfcfb;
    font-weight: 600;
  }

  .collapsed .brand {
    justify-content: center;
    padding-inline: 0;
  }

  /* stylelint-disable selector-class-pattern -- Element Plus 外部组件类名 */
  .menu:where(.el-menu--collapse) {
    :deep(> .el-menu-item),
    :deep(> .el-sub-menu > .el-sub-menu__title) {
      justify-content: center;
      padding-inline: 0;
    }

    :deep(> .el-menu-item .el-menu-tooltip__trigger) {
      justify-content: center;
      padding-inline: 0;
    }
  }
  /* stylelint-enable selector-class-pattern */

  .page-number {
    flex: 0 0 30px;
    color: var(--juya-color-brand-accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .page-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>

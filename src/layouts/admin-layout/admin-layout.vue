<script setup lang="ts">
import {
  Bell,
  Calendar,
  ChatLineSquare,
  DataAnalysis,
  Document,
  Expand,
  House,
  Setting,
  Tickets,
  User
} from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_NAVIGATION_GROUPS } from '@/app/admin-navigation'
import {
  ADMIN_DESIGN_DESCRIPTIONS,
  ADMIN_DESIGN_TITLES,
  CONTENT_STAGE_TITLES
} from '@/app/admin-presentation'
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
const defaultOpenGroups: string[] = []
const pageTitle = computed(() => {
  if (route.name === 'content-scene-edit')
    return CONTENT_STAGE_TITLES[String(route.query.stage ?? 'proofread')] ?? route.meta.title
  return ADMIN_DESIGN_TITLES[String(route.meta.pageNumber)] ?? route.meta.title
})
const pageDescription = computed(
  () => ADMIN_DESIGN_DESCRIPTIONS[String(route.meta.pageNumber)] ?? '句芽英语 V1.3 · 单管理员后台'
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
        <ElButton
          class="logo"
          :aria-label="isCollapsed ? '展开侧栏' : '折叠侧栏'"
          @click="toggleAside"
          ><ElIcon v-if="isCollapsed"><Expand /></ElIcon><span v-else>芽</span></ElButton
        >
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
            <li v-if="groupIndex === 0 && !isCollapsed" class="section-label" role="presentation">
              核心管理
            </li>
            <li v-if="groupIndex === 6 && !isCollapsed" class="section-label" role="presentation">
              基础能力
            </li>
            <ElMenuItem
              v-if="group.pages.length === 1"
              :aria-label="group.label"
              class="top-level-item"
              :index="group.pages[0]?.pageNumber"
            >
              <ElIcon v-if="isCollapsed"><component :is="navigationIconMap[group.icon]" /></ElIcon>
              <template #title>{{ group.label }}</template>
            </ElMenuItem>
            <ElSubMenu v-else :index="group.path">
              <template #title>
                <ElIcon v-if="isCollapsed"
                  ><component :is="navigationIconMap[group.icon]"
                /></ElIcon>
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
          <h1 class="title">{{ pageTitle }}</h1>
          <p class="subtitle">{{ pageDescription }}</p>
        </div>

        <ElDropdown trigger="click">
          <button class="admin" type="button">
            <span class="admin-badge">管理员 · 已认证</span>
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
    border-right: 1px solid var(--juya-color-border-light);
    background: var(--juya-color-sidebar-surface);
  }

  .brand {
    display: flex;
    flex: 0 0 82px;
    align-items: center;
    gap: 12px;
    padding: 24px 20px 12px;
    color: var(--juya-color-text-primary);
  }

  .logo {
    display: grid;
    flex: 0 0 46px;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 0;
    border-radius: 14px;
    background: var(--juya-color-primary-soft);
    color: var(--juya-color-primary);
    font-size: 22px;
    font-weight: 700;
    place-items: center;
  }

  .brand-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
    white-space: nowrap;
  }

  .brand-copy strong {
    font-size: 20px;
  }

  .brand-copy span {
    color: var(--juya-color-text-regular);
    font-size: 11px;
  }

  .menu-scrollbar {
    --el-scrollbar-bg-color: var(--juya-color-primary);
    --el-scrollbar-hover-bg-color: var(--juya-color-primary);
    --el-scrollbar-hover-opacity: 0.6;
    --el-scrollbar-opacity: 0.25;

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
    height: 22px;
    padding: 0 26px;
    color: #78917a;
    font-size: 10px;
    line-height: 22px;
    list-style: none;
  }

  .section-label:not(:first-child) {
    margin-top: 32px;
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
    gap: 24px;
    border-bottom: 1px solid var(--juya-color-border-light);
    background: var(--juya-color-page);
    padding-inline: 32px 50px;
  }

  .title-group {
    min-width: 0;
  }

  .title {
    margin: 0;
    color: var(--juya-color-text-primary);
    font-size: 28px;
    line-height: 40px;
  }

  .subtitle {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 13px;
    line-height: 22px;
  }

  .admin {
    display: flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .admin-badge {
    width: 150px;
    height: 25px;
    border-radius: 12px;
    background: var(--juya-color-primary-soft);
    color: var(--juya-color-primary);
    font-size: 11px;
    font-weight: 500;
    line-height: 25px;
    text-align: center;
  }

  .main {
    min-width: 0;
    overflow: auto;
    padding: var(--juya-main-padding-top) 26px var(--juya-main-padding-bottom)
      var(--juya-main-padding-inline);
    background: var(--juya-color-page);
  }

  .menu.el-menu {
    --el-menu-bg-color: transparent;
    --el-menu-text-color: var(--juya-color-text-primary);
    --el-menu-hover-bg-color: var(--juya-color-sidebar-hover);
    --el-menu-active-color: var(--juya-color-primary);
  }

  .menu :deep(.el-menu) {
    background: transparent;
  }

  /* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
  .menu :deep(.el-sub-menu__title) {
    height: 40px;
    margin: 0 14px 10px;
    border-radius: 12px;
    padding-inline: 13px;
    font-size: 15px;
  }

  .menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
    background: #e4f0dc;
    color: var(--juya-color-primary);
    font-weight: 700;
  }

  .menu :deep(.el-menu-item) {
    height: 36px;
    margin: 0 14px 8px 24px;
    border-radius: 10px;
    padding-inline: 12px;
  }

  .menu :deep(.el-menu-item.top-level-item) {
    height: 40px;
    margin: 0 14px 10px;
    border-radius: 12px;
    padding-inline: 13px;
    font-size: 15px;
  }

  .menu :deep(.el-menu-item.is-active) {
    background: #e4f0dc;
    font-weight: 700;
  }

  .collapsed .brand {
    justify-content: center;
    padding-inline: 0;
  }

  .menu:where(.el-menu--collapse) {
    :deep(> .el-menu-item),
    :deep(> .el-sub-menu > .el-sub-menu__title),
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
  }

  .page-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (width <= 1080px) {
  .admin-layout {
    .header {
      padding-inline: 24px;
    }

    .main {
      padding-inline: 24px;
    }

    .title {
      font-size: 24px;
    }
  }
}
</style>

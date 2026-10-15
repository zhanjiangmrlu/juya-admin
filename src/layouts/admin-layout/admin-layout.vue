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
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_NAVIGATION_GROUPS } from '@/app/admin-navigation'
import {
  ADMIN_DESIGN_DESCRIPTIONS,
  ADMIN_DESIGN_TITLES,
  CONTENT_STAGE_TITLES
} from '@/app/admin-presentation'
import { workOrderPublicationHeadingKey } from '@/app/work-order-publication-heading'
import { useAuthStore } from '@/features/auth/auth-store'

import type { WorkOrderPublicationHeading } from '@/app/work-order-publication-heading'

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
const publicationHeading = shallowRef<(WorkOrderPublicationHeading & { owner: symbol }) | null>(
  null
)
/**
 * 更新当前发布页的权威标题，并阻止旧页面清理新页面上下文
 * @param owner - 发布页实例的独立身份
 * @param heading - 当前路由已读取的阶段标题，空值仅清理同一实例
 */
const setPublicationHeading = (
  owner: symbol,
  heading: WorkOrderPublicationHeading | null
): void => {
  if (!heading) {
    if (publicationHeading.value?.owner === owner) publicationHeading.value = null
    return
  }
  if (heading.routePath !== route.fullPath) return
  publicationHeading.value = { ...heading, owner }
}
provide(workOrderPublicationHeadingKey, setPublicationHeading)
const currentPublicationHeading = computed(() =>
  route.name === 'content-work-order' &&
  route.query.view === 'publication' &&
  publicationHeading.value?.routePath === route.fullPath &&
  publicationHeading.value.workOrderId === String(route.params.id || '')
    ? publicationHeading.value
    : null
)
const isCollapsed = ref(globalThis.innerWidth < 768)
const narrowViewport = globalThis.matchMedia?.('(max-width: 767px)')
/**
 * 窄窗口自动折叠导航并保留手动切换入口
 * @param event - 当前窗口的窄屏匹配状态
 * @param event.matches - 是否进入窄屏布局
 */
const adaptNavigation = (event: { matches: boolean }): void => {
  isCollapsed.value = event.matches
}
onMounted(() => narrowViewport?.addEventListener('change', adaptNavigation))
onBeforeUnmount(() => narrowViewport?.removeEventListener('change', adaptNavigation))
const activePageNumber = computed(() => {
  return String(route.meta.navigationPath ?? route.path)
})
const pageTitle = computed(() => {
  if (currentPublicationHeading.value) return currentPublicationHeading.value.title
  if (route.name === 'content-work-order') {
    const view = String(route.query.view || 'overview')
    if (view === 'import')
      return (
        (
          {
            validation: '校验内容包',
            preview: '核对图文与音频',
            result: '内容包导入结果'
          } as Record<string, string>
        )[String(route.query.import_phase || 'validation')] || '校验内容包'
      )
    return (
      (
        {
          overview: '自动整理结果',
          jobs: '批量任务',
          candidates: '词表与中央定义',
          sampling: '正常内容抽样',
          publication: '校对与发布'
        } as Record<string, string>
      )[view] || '自动整理结果'
    )
  }
  if (route.name === 'learning-modules') return '学习模块配置'
  if (route.name === 'content-proofreading') return '正常内容抽样'
  if (route.name === 'content-short-reading-edit') return '短文结构化编辑'
  if (route.name === 'content-work-item') {
    if (route.query.editor === 'word-card')
      return route.query.section === 'source' ? '原词汇卡原文校对' : '原词汇卡资料'
    if (route.query.editor === 'reading' && route.query.section !== 'source')
      return '短文结构化编辑'
    if (route.query.section === 'entries') return '场景词汇与语块资料'
    if (route.query.section === 'draft') return '场景结构化编辑'
    return '正文对照与配对校对'
  }
  if (route.name === 'formal-entitlement-action') {
    const titles: Record<string, string> = {
      RENEW: '正式权益续期',
      PAUSE: '暂停正式权益',
      RESUME: '恢复正式权益',
      REVOKE: '撤销正式权益',
      GRANT: '开通正式内容'
    }
    const action = String(route.query.action || '')
    return Object.hasOwn(titles, action) ? titles[action] : '正式权益操作'
  }
  if (route.name === 'content-import' && route.query.source === 'materials') return '素材匹配'
  if (route.name === 'content-import' && route.query.source === 'vocabulary') {
    const titles: Record<string, string> = {
      upload: '上传词汇图包',
      validation: '图包校验',
      preview: '图文对应预览',
      // 导航阶段不证明执行或完成状态，由面板的实际绑定回执呈现
      processing: '词汇图包导入结果',
      result: '词汇图包导入结果'
    }
    return titles[String(route.query.material_phase || 'upload')] || titles.upload
  }
  if (route.name === 'content-import' && (route.query.source === 'zip' || route.query.batch_id)) {
    const titles: Record<string, string> = {
      upload: '上传统一内容包',
      validation: '校验内容包',
      preview: '核对图文与音频',
      result: '内容包导入结果'
    }
    return titles[String(route.query.import_phase || 'upload')] || '上传统一内容包'
  }
  if (route.name === 'content-import' && route.query.source === 'docx') return '导入中英文文档'
  if (route.name === 'content-scene-edit')
    return CONTENT_STAGE_TITLES[String(route.query.stage ?? 'proofread')] ?? route.meta.title
  return ADMIN_DESIGN_TITLES[String(route.meta.pageNumber)] ?? route.meta.title
})
const pageDescription = computed(() => {
  if (currentPublicationHeading.value) return currentPublicationHeading.value.description
  if (route.name === 'content-work-order')
    return String(route.query.view) === 'jobs'
      ? '离开页面后可恢复查看 · 成功步骤复用'
      : String(route.query.view || 'overview') === 'overview'
        ? '定位到具体篇目与问题 · 筛选结果需校对确认'
        : String(route.query.view) === 'import'
          ? '保存草稿与校对发布分开确认 · 按本次批次恢复'
          : '保持当前候选与固定范围，按实际结果继续处理'
  if (route.name === 'learning-modules') return '按中文名称配置入口，保存后小程序读取最新配置'
  if (route.name === 'content-short-reading-edit')
    return '纯阅读模式 · 完整英文与全文中文 · 封面和全文音频选填'
  if (route.name === 'content-work-item')
    return route.query.editor === 'reading' && route.query.section !== 'source'
      ? '独立短文模板 · 完整中英文 · 全文音频选填'
      : route.query.section === 'entries'
        ? '保存本篇候选资料 · 词汇可选图片 · 语块采用无图列表'
        : '原文保留 · 人工校对当前候选 · 保存不会发布'
  if (route.name === 'content-import' && route.query.source === 'zip')
    return '正文、译文、封面、词汇图片与音频，按 ID 一次绑定'
  if (route.name === 'content-import' && route.query.source === 'materials')
    return '按实际素材与固定草稿核对 · 标题候选须人工采纳'
  if (route.name === 'content-import' && route.query.source === 'vocabulary')
    return '英文、当前释义与对应图片 · 按条目 ID 核对'
  return ADMIN_DESIGN_DESCRIPTIONS[String(route.meta.pageNumber)] ?? '句芽英语 V1.5 · 单管理员后台'
})

/**
 * 从 Element Plus 菜单切换到无需业务上下文的页面
 *
 * @param path - 管理员选择的一级业务入口
 * @returns 路由切换完成后的 Promise
 */
const navigateToPage = async (path: string): Promise<void> => {
  const group = ADMIN_NAVIGATION_GROUPS.find((item) => item.path === path)
  if (!group) return
  await router.push(group.path === '/settings' ? '/settings/learning-modules' : group.path)
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
          :key="isCollapsed ? 'collapsed-navigation' : 'expanded-navigation'"
          class="menu"
          :collapse="isCollapsed"
          :collapse-transition="false"
          :default-active="activePageNumber"
          @select="navigateToPage"
        >
          <template v-for="(group, groupIndex) in ADMIN_NAVIGATION_GROUPS" :key="group.path">
            <li v-if="groupIndex === 0 && !isCollapsed" class="section-label" role="presentation">
              核心管理
            </li>
            <li v-if="groupIndex === 6 && !isCollapsed" class="section-label" role="presentation">
              基础能力
            </li>
            <ElMenuItem :aria-label="group.label" class="top-level-item" :index="group.path">
              <ElIcon v-if="isCollapsed"><component :is="navigationIconMap[group.icon]" /></ElIcon>
              <template #title>{{ group.label }}</template>
            </ElMenuItem>
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
        <ElScrollbar
          class="page-scrollbar"
          aria-label="页面内容"
          :always="true"
          :tabindex="0"
          wrap-class="page-scrollbar-wrap"
          view-class="page-scrollbar-view"
        >
          <RouterView />
        </ElScrollbar>
      </ElMain>
      <footer class="page-footer">
        <span class="footer-brand">句芽英语 · V1.5</span>
        <div id="admin-page-actions" class="footer-actions" aria-label="页面操作" />
      </footer>
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
    flex-direction: column;
    min-height: 0;
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
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    background: var(--juya-color-page);
  }

  .page-scrollbar {
    flex: 1;
    min-width: 0;
  }

  :deep(.page-scrollbar-wrap) {
    overflow-x: hidden;
  }

  :deep(.page-scrollbar-wrap:focus-visible) {
    outline: 2px solid var(--juya-color-brand-accent);
    outline-offset: -2px;
  }

  :deep(.page-scrollbar-view) {
    padding: var(--juya-main-padding-top) var(--juya-main-padding-inline)
      var(--juya-main-padding-bottom);
  }

  .page-footer {
    display: flex;
    flex: 0 0 auto;
    min-height: 62px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 32px;
    background: var(--juya-color-surface);

    .footer-brand {
      flex-shrink: 0;
      color: var(--juya-color-text-secondary);
      font-size: 11px;
    }

    .footer-actions {
      min-width: 0;
    }
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

@media (width <= 767px) {
  .admin-layout {
    .header {
      padding-inline: 16px;
      gap: 12px;
      align-items: flex-start;
      padding-top: 14px;
    }

    .title {
      font-size: 20px;
      line-height: 1.4;
    }

    .subtitle {
      font-size: 11px;
      line-height: 1.5;
    }

    .admin-badge {
      width: 80px;
    }

    .page-footer {
      padding-inline: 16px;

      .footer-brand {
        display: none;
      }

      .footer-actions {
        width: 100%;
      }
    }

    .main {
      padding-inline: 0;
    }

    :deep(.page-scrollbar-view) {
      padding: 16px;
    }
  }
}
</style>

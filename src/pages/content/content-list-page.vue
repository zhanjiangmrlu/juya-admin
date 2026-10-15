<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'
import AppPagination from '@/components/app-pagination/app-pagination.vue'
import { type ContentSeries, createContentAdapter } from '@/features/content/content-adapter'
import {
  type CatalogueFilters,
  type CatalogueItem,
  createCatalogueAdapter
} from '@/features/content-catalogue/content-catalogue-adapter'
import SceneHistory from '@/features/content-editor/scene-history.vue'
import { createWorkOrderAdapter } from '@/features/content-production/work-order-adapter'
import { resolveWorkOrderContext } from '@/features/content-production/work-order-context'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ProductionSchema } from '@/features/content-production/work-order-model'

const router = useRouter()
const route = useRoute()
const client = useAdminApiClient()
const content = createContentAdapter(client)
const catalogue = createCatalogueAdapter(client)
const production = createWorkOrderAdapter(client)
const contexts = ref<ProductionSchema['ContentContext'][]>([])
const readings = createShortReadingAdapter(client)
const storageKey = 'juya.content-list.filters.v1'
const types = { dialogue: '场景对话', word_card: '原词汇卡', short_reading: '短文阅读' }
const statuses = { DRAFT: '草稿', PUBLISHED: '已发布', OFFLINE: '已下线' }
/**
 * 恢复目录条件，校验类型与页码，避免旧条件变成隐藏的筛选
 * @returns 已校验的目录筛选
 */
const restoreFilters = (): CatalogueFilters => {
  const defaults: CatalogueFilters = {
    page: 1,
    pageSize: ADMIN_UI_DEFAULTS.pagination.pageSize,
    query: '',
    seriesId: '',
    contentType: '',
    status: ''
  }
  try {
    const saved = JSON.parse(
      globalThis.sessionStorage.getItem(storageKey) || '{}'
    ) as Partial<CatalogueFilters>
    return {
      ...defaults,
      page: Number.isInteger(saved.page) && Number(saved.page) > 0 ? Number(saved.page) : 1,
      pageSize: ADMIN_UI_DEFAULTS.pagination.pageSizes.includes(Number(saved.pageSize))
        ? Number(saved.pageSize)
        : defaults.pageSize,
      query: typeof saved.query === 'string' ? saved.query : '',
      seriesId: typeof saved.seriesId === 'string' ? saved.seriesId : '',
      contentType:
        saved.contentType && Object.hasOwn(types, saved.contentType) ? saved.contentType : '',
      status: saved.status && Object.hasOwn(statuses, saved.status) ? saved.status : ''
    }
  } catch {
    return defaults
  }
}
const filters = reactive(restoreFilters())
if (typeof route.query.scene_id === 'string')
  Object.assign(filters, {
    page: 1,
    query: route.query.scene_id,
    seriesId: '',
    contentType: '',
    status: ''
  })
const items = ref<CatalogueItem[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const creating = ref(false)
const creatingSeries = ref(false)
const creatingScene = ref(false)
const series = ref<ContentSeries[]>([])
const historySceneId = ref('')
const historyOpened = ref(false)
const newScene = reactive({
  seriesId: '',
  templateType: 'dialogue',
  seriesTitle: ''
})
let sequence = 0
let disposed = false
let abort: InstanceType<typeof globalThis.AbortController> | null = null
let pendingSeriesKey = createIdempotencyKey()
let pendingManualKey = createIdempotencyKey()
watch(
  () => [newScene.seriesId, newScene.templateType],
  () => {
    pendingManualKey = createIdempotencyKey()
  }
)
watch(
  filters,
  () => {
    try {
      globalThis.sessionStorage.setItem(storageKey, JSON.stringify(filters))
    } catch {
      /* 存储不阻断查询 */
    }
  },
  { deep: true }
)

watch(
  () => newScene.seriesTitle,
  () => {
    pendingSeriesKey = createIdempotencyKey()
  }
)
/** 读取服务端统一分页，取消旧查询并阻止迟到结果回写 */
const loadScenes = async (): Promise<void> => {
  const token = ++sequence
  abort?.abort()
  abort = new globalThis.AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await catalogue.list({ ...filters }, abort.signal)
    if (disposed || token !== sequence) return
    items.value = result.items
    total.value = result.total
    const groups = await Promise.all(
      (['dialogue', 'word_card', 'short_reading'] as const).map(async (contentType) => {
        const ids = result.items
          .filter((row) => row.content_type === contentType)
          .map((row) => row.id)
        return ids.length
          ? (await production.contexts({ content_type: contentType, content_ids: ids })).items
          : []
      })
    )
    if (!disposed && token === sequence) contexts.value = groups.flat()
  } catch (failure) {
    if (!disposed && token === sequence)
      error.value = failure instanceof Error ? failure.message : '内容列表加载失败'
  } finally {
    if (!disposed && token === sequence) loading.value = false
  }
}
/** 新筛选回到第一页，所有类型共享目录 */
const search = (): void => {
  filters.page = 1
  void loadScenes()
}
/** 清除旧分类筛选并重新查询全部分类 */
const clearSeries = (): void => {
  filters.seriesId = ''
  search()
}
/** 读取实际分类并打开单篇新建 */
const openCreate = async (): Promise<void> => {
  try {
    series.value = await content.listSeries()
    if (disposed) return
    creating.value = true
  } catch (failure) {
    if (!disposed) ElMessage.error(failure instanceof Error ? failure.message : '分类加载失败')
  }
}
/** 创建分类，失败重试复用相同身份 */
const createSeries = async (): Promise<void> => {
  if (creatingSeries.value || !newScene.seriesTitle.trim()) return
  creatingSeries.value = true
  try {
    const value = await content.createSeries(
      newScene.seriesTitle.trim(),
      `series-${pendingSeriesKey}`,
      pendingSeriesKey
    )
    if (disposed) return
    series.value.push(value)
    newScene.seriesId = value.id
    newScene.seriesTitle = ''
  } catch (failure) {
    if (!disposed) ElMessage.error(failure instanceof Error ? failure.message : '分类创建失败')
  } finally {
    creatingSeries.value = false
  }
}
/** 按所选模板创建草稿，纯阅读使用独立版本链路 */
const createScene = async (): Promise<void> => {
  if (creatingScene.value || !newScene.seriesId) return
  creatingScene.value = true
  try {
    const context = await resolveWorkOrderContext(
      production,
      {
        series_id: newScene.seriesId,
        content_type: newScene.templateType as 'dialogue' | 'word_card' | 'short_reading'
      },
      pendingManualKey
    )
    if (!disposed)
      await router.push({
        name: 'content-work-item',
        params: { id: context.orderId, itemId: context.itemId }
      })
  } catch (failure) {
    if (!disposed) ElMessage.error(failure instanceof Error ? failure.message : '内容创建失败')
  } finally {
    creatingScene.value = false
  }
}
/**
 * 查看或编辑候选版本，不修改已经发布的快照
 * @param row - 管理员选择的真实内容
 */
const edit = async (row: CatalogueItem): Promise<void> => {
  try {
    if (row.content_type === 'short_reading') {
      if (!row.draft_revision_id)
        await readings.createRevision(await readings.load(row.id), createIdempotencyKey())
    } else if (!row.draft_revision_id)
      await content.createRevision(row.id, row.published_revision_id)
    const context = await resolveWorkOrderContext(production, {
      content_type: row.content_type,
      content_id: row.id,
      series_id: row.series_id
    })
    if (!disposed)
      await router.push({
        name: 'content-work-item',
        params: { id: context.orderId, itemId: context.itemId }
      })
  } catch (failure) {
    if (!disposed) ElMessage.error(failure instanceof Error ? failure.message : '内容打开失败')
  }
}
/**
 * 打开已有历史，短文由独立编辑器展示版本
 * @param row - 要查看版本的实际内容
 */
const openHistory = (row: CatalogueItem): void => {
  if (row.content_type === 'short_reading') {
    void router.push({
      name: 'content-short-reading-edit',
      params: { id: row.id },
      query: { history: '1' }
    })
    return
  }
  historySceneId.value = row.id
  historyOpened.value = true
}
/**
 * 经过明确确认下线内容，历史与收藏引用继续保留
 * @param row - 已发布的目录记录
 */
const offline = async (row: CatalogueItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      `下线后用户将无法访问“${row.title_zh || row.title_en}”，是否继续？`,
      '确认下线',
      { cancelButtonText: '取消', confirmButtonText: '确认下线', type: 'warning' }
    )
    if (row.content_type === 'short_reading') await readings.offline(await readings.load(row.id))
    else await content.offline(row.id, createIdempotencyKey())
    await loadScenes()
    ElMessage.success('内容已下线')
  } catch (failure) {
    if (failure !== 'cancel' && failure !== 'close')
      ElMessage.error(failure instanceof Error ? failure.message : '下线失败')
  }
}
/**
 * 打开已有内容所属的发布范围，仍由服务端校验合格候选
 * @param row - 所选目录内容与实际分类
 */
const openPublication = async (row: CatalogueItem): Promise<void> => {
  try {
    const context = await resolveWorkOrderContext(production, {
      content_type: row.content_type,
      content_id: row.id,
      series_id: row.series_id
    })
    if (!disposed)
      await router.push({
        name: 'content-work-order',
        params: { id: context.orderId },
        query: { view: 'publication' }
      })
  } catch (failure) {
    if (!disposed) ElMessage.error(failure instanceof Error ? failure.message : '发布范围加载失败')
  }
}
onMounted(loadScenes)
onBeforeUnmount(() => {
  disposed = true
  sequence++
  abort?.abort()
})
</script>
<template>
  <section class="content-list-page">
    <ElForm class="filter-bar" @submit.prevent="search">
      <ElInput
        v-model="filters.query"
        class="title-search"
        clearable
        aria-label="关键词"
        placeholder="按中英文标题搜索"
        @keyup.enter="search"
      />
      <ElSelect
        v-model="filters.contentType"
        aria-label="内容类型筛选"
        placeholder="全部类型"
        clearable
        @change="search"
        ><ElOption v-for="(label, value) in types" :key="value" :label="label" :value="value"
      /></ElSelect>
      <ElSelect
        v-model="filters.status"
        aria-label="内容状态筛选"
        placeholder="全部状态"
        clearable
        @change="search"
        ><ElOption v-for="(label, value) in statuses" :key="value" :label="label" :value="value"
      /></ElSelect>
      <ElButton native-type="submit">查询</ElButton
      ><ElButton v-if="filters.seriesId" @click="clearSeries">清除分类筛选</ElButton>
    </ElForm>
    <AdminPanel title="内容列表">
      <ElSkeleton v-if="loading" :rows="5" animated />
      <ElAlert v-else-if="error" :title="error" type="error" :closable="false"
        ><ElButton @click="loadScenes">重新加载</ElButton></ElAlert
      >
      <ElTable v-else :data="items" empty-text="暂无符合条件的内容">
        <ElTableColumn label="内容标题" min-width="290"
          ><template #default="{ row }"
            >{{ row.title_en || '未命名内容'
            }}<span v-if="row.title_zh">｜{{ row.title_zh }}</span></template
          ></ElTableColumn
        >
        <ElTableColumn label="类型" width="140"
          ><template #default="{ row }">{{
            types[row.content_type as keyof typeof types]
          }}</template></ElTableColumn
        >
        <ElTableColumn prop="series_title" label="分类" min-width="180" />
        <ElTableColumn label="状态" min-width="150"
          ><template #default="{ row }"
            >{{ statuses[row.status as keyof typeof statuses]
            }}<small v-if="row.status === 'PUBLISHED' && row.draft_revision_id"
              >有候选版本</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="操作" min-width="260"
          ><template #default="{ row }">
            <ElButton link type="primary" @click="edit(row)">{{
              row.status === 'DRAFT' ? '继续校对' : '查看 · 编辑新版本'
            }}</ElButton>
            <ElButton v-if="row.draft_revision_id" link type="primary" @click="openPublication(row)"
              >预览 · 发布</ElButton
            >
            <ElButton link @click="openHistory(row)">查看历史</ElButton
            ><ElButton v-if="row.status === 'PUBLISHED'" link type="danger" @click="offline(row)"
              >下线</ElButton
            >
          </template></ElTableColumn
        >
      </ElTable>
      <AppPagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="total"
        :disabled="loading"
        @change="loadScenes"
      />
    </AdminPanel>
    <ElAlert class="operation-note" title="按模板展示内容" type="info" :closable="false"
      >学习图片、重点词汇和语块按需展开；没有配图也可发布。已发布内容可下线并保留历史引用。</ElAlert
    >
    <AppPageActions
      ><ElButton @click="openCreate">单篇新建</ElButton
      ><ElButton type="primary" @click="router.push({ name: 'content-import' })"
        >批量导入</ElButton
      ></AppPageActions
    >
    <ElDialog
      v-model="creating"
      title="单篇新建"
      width="min(560px,94vw)"
      :close-on-click-modal="!creatingScene && !creatingSeries"
      :close-on-press-escape="!creatingScene && !creatingSeries"
      :show-close="!creatingScene && !creatingSeries"
    >
      <ElForm label-position="top" :disabled="creatingScene || creatingSeries">
        <ElFormItem label="所属系列"
          ><ElSelect v-model="newScene.seriesId" aria-label="新场景所属系列"
            ><ElOption
              v-for="item in series"
              :key="item.id"
              :label="item.title"
              :value="item.id" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="内容模板"
          ><ElRadioGroup v-model="newScene.templateType"
            ><ElRadio v-for="(label, value) in types" :key="value" :value="value">{{
              label
            }}</ElRadio></ElRadioGroup
          ></ElFormItem
        >
        <details>
          <summary>创建新分类</summary>
          <ElFormItem label="系列名称"><ElInput v-model="newScene.seriesTitle" /></ElFormItem
          ><ElButton
            :loading="creatingSeries"
            :disabled="!newScene.seriesTitle"
            @click="createSeries"
            >创建系列</ElButton
          >
        </details>
      </ElForm>
      <template #footer
        ><ElButton :disabled="creatingScene" @click="creating = false">取消</ElButton
        ><ElButton
          type="primary"
          :loading="creatingScene"
          :disabled="!newScene.seriesId"
          @click="createScene"
          >创建并编辑</ElButton
        ></template
      >
    </ElDialog>
    <SceneHistory v-model="historyOpened" :scene-id="historySceneId" />
  </section>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-class-pattern -- Element Plus 组件类名 */
.content-list-page {
  display: grid;
  gap: 20px;
  min-width: 0;

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;

    .title-search {
      flex: 1 1 320px;
      max-width: 520px;
    }

    :deep(.el-select) {
      width: 160px;
    }
  }

  :deep(.el-card__header) {
    padding: 24px 24px 0;
  }

  :deep(.el-card__body) {
    padding: 16px 24px 24px;
  }

  :deep(.admin-panel-title) {
    font-size: 18px;
    line-height: 29px;
  }

  :deep(.el-table__cell) {
    padding-block: 12px;
  }

  :deep(.el-button.is-link) {
    margin-left: 0;
    margin-right: 8px;
  }

  small {
    display: block;
    color: var(--juya-color-text-secondary);
  }

  .operation-note {
    padding: 16px;
    border-radius: 16px;
  }

  .related-links {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    color: var(--juya-color-primary);
    font-size: 13px;
  }

  @media (width <= 767px) {
    :deep(.el-card__header) {
      padding: 16px 16px 0;
    }

    :deep(.el-card__body) {
      padding: 12px 16px;
    }

    .filter-bar :deep(.el-select) {
      flex: 1 1 110px;
    }
  }
}
</style>

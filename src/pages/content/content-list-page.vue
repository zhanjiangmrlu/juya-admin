<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { createContentAdapter } from '@/features/content/content-adapter'
import SceneHistory from '@/features/content-editor/scene-history.vue'
import ContentProductionNav from '@/features/content-production/content-production-nav.vue'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { ContentSeries } from '@/features/content/content-adapter'
import type { SceneFilters, SceneStatus, SceneSummary } from '@/features/content/content-model'
import type { ProductionStage } from '@/features/content-production/content-production-model'

const historySceneId = ref('')
const historyOpened = ref(false)
const router = useRouter()
const adapter = createContentAdapter(useAdminApiClient())
const filterStorageKey = 'juya.content-list.filters.v1'
const filters = reactive<SceneFilters>(restoreFilters())
const scenes = ref<SceneSummary[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const series = ref<ContentSeries[]>([])
const creating = ref(false)
const creatingSeries = ref(false)
const creatingScene = ref(false)
const pickingScene = ref(false)
const workspaceSceneId = ref('')
const workspaceStage = ref<ProductionStage>('draft')
const enteringWorkspace = ref(false)
let pendingSeriesKey: string | null = null
let pendingSceneKey: string | null = null
const newScene = reactive({
  seriesId: '',
  templateType: 'dialogue' as 'dialogue' | 'vocabulary',
  seriesTitle: '',
  seriesSlug: ''
})

/**
 * 列表没有当前草稿时，先由管理员明确选择目标场景。
 * @param stage - 目标工作区
 */
function openWorkspace(stage: ProductionStage): void {
  if (stage === 'list') return
  workspaceStage.value = stage
  workspaceSceneId.value = ''
  pickingScene.value = true
}

/** 创建或使用所选场景的草稿，再进入所选步骤。 */
async function enterWorkspace(): Promise<void> {
  const selected = scenes.value.find((item) => item.id === workspaceSceneId.value)
  if (!selected || enteringWorkspace.value) return
  enteringWorkspace.value = true
  try {
    const revisionId =
      selected.draftRevisionId ??
      (await adapter.createRevision(selected.id, selected.publishedRevisionId)).id
    if (workspaceStage.value === 'publish') {
      await router.push({ name: 'content-scene-publish', params: { id: revisionId } })
    } else {
      await router.push({
        name: 'content-scene-edit',
        params: { id: selected.id },
        query: { stage: workspaceStage.value }
      })
    }
    pickingScene.value = false
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '工作区打开失败')
  } finally {
    enteringWorkspace.value = false
  }
}

/** 从场景选择对话框进入既有新建场景表单。 */
async function createFromWorkspace(): Promise<void> {
  await openCreate()
  if (creating.value) pickingScene.value = false
}

/** 打开指定场景的完整历史列表。
 * @param id - 稳定场景编号
 */
function openHistory(id: string): void {
  historySceneId.value = id
  historyOpened.value = true
}
/** 加载系列目录并打开新建场景表单。 */
async function openCreate(): Promise<void> {
  try {
    series.value = await adapter.listSeries()
    creating.value = true
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '系列加载失败')
  }
}
/** 保存新系列，供场景使用。 */
async function createSeries(): Promise<void> {
  if (creatingSeries.value || !newScene.seriesTitle.trim() || !newScene.seriesSlug.trim()) return
  pendingSeriesKey ??= createIdempotencyKey()
  creatingSeries.value = true
  try {
    const item = await adapter.createSeries(
      newScene.seriesTitle.trim(),
      newScene.seriesSlug.trim(),
      pendingSeriesKey
    )
    pendingSeriesKey = null
    series.value.push(item)
    newScene.seriesId = item.id
    newScene.seriesTitle = ''
    newScene.seriesSlug = ''
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '系列创建失败')
  } finally {
    creatingSeries.value = false
  }
}
/** 创建空白草稿并进入结构化编辑。 */
async function createScene(): Promise<void> {
  if (creatingScene.value || !newScene.seriesId) return
  pendingSceneKey ??= createIdempotencyKey()
  creatingScene.value = true
  try {
    const created = await adapter.createScene(
      newScene.seriesId,
      newScene.templateType,
      pendingSceneKey
    )
    pendingSceneKey = null
    await router.push({ name: 'content-scene-edit', params: { id: created.id } })
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '场景创建失败')
  } finally {
    creatingScene.value = false
  }
}

watch(filters, persistFilters, { deep: true })
watch(creating, (opened) => {
  if (!opened) {
    pendingSeriesKey = null
    pendingSceneKey = null
  }
})

/**
 * 从会话存储恢复内容目录筛选
 * @returns 已校验的筛选条件
 */
function restoreFilters(): SceneFilters {
  const defaults: SceneFilters = { page: 1, pageSize: 20, query: '', seriesId: '', status: '' }
  try {
    const saved = JSON.parse(
      globalThis.sessionStorage.getItem(filterStorageKey) ?? '{}'
    ) as Partial<SceneFilters>
    const statuses: SceneStatus[] = ['DRAFT', 'OFFLINE', 'PUBLISHED']
    return {
      page: Number.isInteger(saved.page) && Number(saved.page) > 0 ? Number(saved.page) : 1,
      pageSize:
        Number.isInteger(saved.pageSize) && Number(saved.pageSize) > 0
          ? Number(saved.pageSize)
          : 20,
      query: typeof saved.query === 'string' ? saved.query : '',
      seriesId: typeof saved.seriesId === 'string' ? saved.seriesId : '',
      status: statuses.includes(saved.status as SceneStatus) ? (saved.status as SceneStatus) : ''
    }
  } catch {
    return defaults
  }
}

/**
 * 保存筛选条件，供当前浏览器会话恢复
 * @param nextFilters - 当前筛选条件
 */
function persistFilters(nextFilters: SceneFilters): void {
  try {
    globalThis.sessionStorage.setItem(filterStorageKey, JSON.stringify(nextFilters))
  } catch {
    // 存储不可用不应阻断内容查询
  }
}

/** 加载当前筛选条件对应的场景分页。 */
async function loadScenes(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const result = await adapter.listScenes(filters)
    scenes.value = result.items
    total.value = result.total
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '内容列表加载失败'
  } finally {
    loading.value = false
  }
}

/** 回到第一页并执行查询。 */
function search(): void {
  filters.page = 1
  void loadScenes()
}

/**
 * 从已发布版本创建新草稿并进入编辑页
 * @param scene - 目标场景
 */
async function createDraft(scene: SceneSummary): Promise<void> {
  try {
    const revision = await adapter.createRevision(scene.id, scene.publishedRevisionId)
    await router.push({ name: 'content-scene-edit', params: { id: revision.sceneId } })
  } catch (failure) {
    ElMessage.error(failure instanceof Error ? failure.message : '草稿创建失败')
  }
}

/**
 * 二次确认后下线已发布场景
 * @param scene - 目标场景
 */
async function offline(scene: SceneSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(`下线后用户将无法访问“${scene.title}”，是否继续？`, '确认下线', {
      cancelButtonText: '取消',
      confirmButtonText: '确认下线',
      type: 'warning'
    })
    await adapter.offline(scene.id, createIdempotencyKey())
    ElMessage.success('场景已下线')
    await loadScenes()
  } catch (failure) {
    if (failure === 'cancel' || failure === 'close') return
    ElMessage.error(failure instanceof Error ? failure.message : '场景下线失败')
  }
}

/**
 * 返回场景状态对应的标签样式
 * @param status - 场景状态
 * @returns Element Plus 标签类型
 */
function statusType(status: SceneStatus): 'info' | 'success' | 'warning' {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'DRAFT') return 'warning'
  return 'info'
}

/**
 * 返回场景状态对应的中文文案
 * @param status - 场景状态
 * @returns 中文状态文案
 */
function statusLabel(status: SceneStatus): string {
  return { DRAFT: '草稿', OFFLINE: '已下线', PUBLISHED: '已发布' }[status]
}

onMounted(loadScenes)
</script>

<template>
  <section class="content-list-page">
    <ContentProductionNav active="list" :busy="enteringWorkspace" @select="openWorkspace" />
    <ElCard shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <span>A17</span>
            <h2>内容列表</h2>
          </div>
          <div class="heading-actions">
            <ElButton type="primary" @click="openCreate">新建场景</ElButton
            ><RouterLink v-slot="{ navigate }" custom :to="{ name: 'content-import' }"
              ><ElButton type="primary" @click="navigate">批量上传图片</ElButton></RouterLink
            >
          </div>
        </div>
      </template>
      <ElForm class="filter-bar" inline @submit.prevent="search">
        <ElFormItem label="关键词"
          ><ElInput v-model="filters.query" clearable placeholder="场景名称或编号"
        /></ElFormItem>
        <ElFormItem label="系列"
          ><ElInput v-model="filters.seriesId" clearable placeholder="全部系列"
        /></ElFormItem>
        <ElFormItem label="状态"
          ><ElSelect
            v-model="filters.status"
            aria-label="内容状态筛选"
            clearable
            placeholder="全部状态"
            ><ElOption label="草稿" value="DRAFT" /><ElOption
              label="已发布"
              value="PUBLISHED" /><ElOption label="已下线" value="OFFLINE" /></ElSelect
        ></ElFormItem>
        <ElFormItem><ElButton native-type="submit" type="primary">查询</ElButton></ElFormItem>
      </ElForm>
      <ElSkeleton v-if="loading" :rows="7" animated />
      <ElAlert v-else-if="error" :closable="false" :title="error" type="error" show-icon
        ><template #default
          ><ElButton link type="primary" @click="loadScenes">重新加载</ElButton></template
        ></ElAlert
      >
      <ElEmpty v-else-if="scenes.length === 0" description="暂无符合条件的内容" />
      <template v-else>
        <ElTable :data="scenes" row-key="id" stripe>
          <ElTableColumn label="场景" min-width="260"
            ><template #default="{ row }"
              ><strong>{{ row.title }}</strong>
              <p class="secondary">{{ row.id }} · {{ row.summary || '暂无简介' }}</p></template
            ></ElTableColumn
          >
          <ElTableColumn label="系列" min-width="150" prop="seriesTitle" />
          <ElTableColumn label="状态" width="100"
            ><template #default="{ row }"
              ><ElTag :type="statusType(row.status)" effect="plain">{{
                statusLabel(row.status)
              }}</ElTag></template
            ></ElTableColumn
          >
          <ElTableColumn label="更新时间" min-width="160"
            ><template #default="{ row }">{{ row.updatedAt || '—' }}</template></ElTableColumn
          >
          <ElTableColumn fixed="right" label="操作" min-width="260"
            ><template #default="{ row }">
              <ElButton
                v-if="row.draftRevisionId"
                link
                type="primary"
                @click="router.push({ name: 'content-scene-edit', params: { id: row.id } })"
                >编辑草稿</ElButton
              >
              <ElButton v-else link type="primary" @click="createDraft(row)">创建草稿</ElButton>
              <ElButton
                v-if="row.draftRevisionId"
                link
                type="primary"
                @click="
                  router.push({
                    name: 'content-scene-publish',
                    params: { id: row.draftRevisionId }
                  })
                "
                >检查发布</ElButton
              >
              <ElButton link @click="openHistory(row.id)">完整版本历史</ElButton
              ><ElButton v-if="row.status === 'PUBLISHED'" link type="danger" @click="offline(row)"
                >下线</ElButton
              >
            </template></ElTableColumn
          >
        </ElTable>
        <ElPagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          class="pagination"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="loadScenes"
        />
      </template>
    </ElCard>
    <ElDialog
      v-model="pickingScene"
      title="选择场景"
      width="min(560px, 94vw)"
      :close-on-click-modal="!enteringWorkspace"
      :close-on-press-escape="!enteringWorkspace"
      :show-close="!enteringWorkspace"
    >
      <p>先选择当前列表中的场景；没有草稿时将创建候选草稿，已发布版本继续保留。</p>
      <ElSelect
        v-model="workspaceSceneId"
        aria-label="工作区场景"
        placeholder="请选择场景"
        :disabled="enteringWorkspace"
        class="workspace-select"
      >
        <ElOption
          v-for="item in scenes"
          :key="item.id"
          :value="item.id"
          :label="`${item.title} · ${item.id}`"
        />
      </ElSelect>
      <ElEmpty v-if="!scenes.length" description="当前筛选没有场景，请调整筛选或新建场景" />
      <template #footer>
        <ElButton :disabled="enteringWorkspace" @click="createFromWorkspace">新建场景</ElButton>
        <ElButton :disabled="enteringWorkspace" @click="pickingScene = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!workspaceSceneId"
          :loading="enteringWorkspace"
          @click="enterWorkspace"
          >进入工作区</ElButton
        >
      </template>
    </ElDialog>
    <ElDialog v-model="creating" title="新建场景" width="560px"
      ><ElForm label-position="top"
        ><ElFormItem label="所属系列"
          ><ElSelect v-model="newScene.seriesId" aria-label="新场景所属系列"
            ><ElOption
              v-for="item in series"
              :key="item.id"
              :label="item.title"
              :value="item.id" /></ElSelect></ElFormItem
        ><ElFormItem label="内容模板"
          ><ElRadioGroup v-model="newScene.templateType"
            ><ElRadio value="dialogue">对话</ElRadio
            ><ElRadio value="vocabulary">词汇</ElRadio></ElRadioGroup
          ></ElFormItem
        ><ElDivider>创建新系列</ElDivider
        ><ElFormItem label="系列名称"><ElInput v-model="newScene.seriesTitle" /></ElFormItem
        ><ElFormItem label="系列标识"
          ><ElInput v-model="newScene.seriesSlug" placeholder="如 daily-english" /></ElFormItem
        ><ElButton
          :loading="creatingSeries"
          :disabled="!newScene.seriesTitle || !newScene.seriesSlug"
          @click="createSeries"
          >创建系列</ElButton
        ></ElForm
      ><template #footer
        ><ElButton @click="creating = false">取消</ElButton
        ><ElButton
          type="primary"
          :loading="creatingScene"
          :disabled="!newScene.seriesId"
          @click="createScene"
          >创建并编辑</ElButton
        ></template
      ></ElDialog
    >
    <SceneHistory v-model="historyOpened" :scene-id="historySceneId" />
  </section>
</template>

<style scoped lang="scss">
.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.heading-actions {
  display: flex;
  gap: 10px;
}

.page-heading span {
  color: var(--juya-color-text-primary);
  font-size: 11px;
  font-weight: 700;
}

.page-heading h2 {
  margin: 3px 0 0;
  color: var(--juya-color-sidebar);
  font-size: 16px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
  margin-bottom: 4px;
}

.filter-bar :deep(.el-input),
.filter-bar :deep(.el-select) {
  width: 190px;
}

.secondary {
  margin: 4px 0 0;
  color: var(--juya-color-text-secondary);
  font-size: 12px;
}

.pagination {
  justify-content: flex-end;
  margin-top: 16px;
}

.workspace-select {
  width: 100%;
}
</style>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { createContentAdapter } from '@/features/content/content-adapter'
import { createIdempotencyKey } from '@/services/api/api-client'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { SceneFilters, SceneStatus, SceneSummary } from '@/features/content/content-model'

const router = useRouter()
const adapter = createContentAdapter(useAdminApiClient())
const filters = reactive<SceneFilters>({
  page: 1,
  pageSize: 20,
  query: '',
  seriesId: '',
  status: ''
})
const scenes = ref<SceneSummary[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

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
    <ElCard shadow="never">
      <template #header>
        <div class="page-heading">
          <div>
            <span>A17</span>
            <h2>内容列表</h2>
          </div>
          <RouterLink v-slot="{ navigate }" custom :to="{ name: 'content-import' }"
            ><ElButton type="primary" @click="navigate">批量上传图片</ElButton></RouterLink
          >
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
              <ElButton v-if="row.status === 'PUBLISHED'" link type="danger" @click="offline(row)"
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
  </section>
</template>

<style scoped lang="scss">
.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
</style>

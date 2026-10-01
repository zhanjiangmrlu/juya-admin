<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { createContentAdapter, type RevisionHistoryPage } from '@/features/content/content-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { SceneRevision } from '@/features/content/content-model'

import ScenePreview from './scene-preview.vue'

const opened = defineModel<boolean>({ required: true })
const props = defineProps<{ sceneId: string }>()
const adapter = createContentAdapter(useAdminApiClient())
const router = useRouter()
const page = ref(1)
const history = ref<RevisionHistoryPage | null>(null)
const preview = ref<SceneRevision | null>(null)
const busy = ref(false)
const error = ref('')
let generation = 0
/** 装载当前场景的完整历史分页。 */
async function load(): Promise<void> {
  const current = ++generation
  busy.value = true
  error.value = ''
  try {
    const result = await adapter.listRevisionHistory(props.sceneId, page.value)
    if (current === generation) history.value = result
  } catch (failure) {
    if (current === generation)
      error.value = failure instanceof Error ? failure.message : '历史加载失败'
  } finally {
    if (current === generation) busy.value = false
  }
}
/**
 * 读取完整历史快照供预览。
 * @param id - 完整历史版本编号
 */
async function view(id: string): Promise<void> {
  busy.value = true
  try {
    preview.value = await adapter.getRevision(id)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '版本加载失败'
  } finally {
    busy.value = false
  }
}
/**
 * 复制所选完整历史版本并进入发布检查。
 * @param id - 完整历史版本编号
 */
async function restore(id: string): Promise<void> {
  if (busy.value) return
  try {
    await ElMessageBox.confirm(
      '将所选完整版本复制为新的当前草稿（现有草稿仍保留在历史中）。未保存的编辑请先保存。候选须重新核对并通过相同发布检查后，才原子切换线上版本。',
      '创建完整回退候选',
      { confirmButtonText: '创建候选', cancelButtonText: '取消', type: 'warning' }
    )
    busy.value = true
    const revision = await adapter.createRevision(props.sceneId, id)
    ElMessage.success('完整候选已创建，请检查并发布')
    opened.value = false
    await router.push({ name: 'content-scene-publish', params: { id: revision.id } })
  } catch (failure) {
    if (failure !== 'cancel' && failure !== 'close')
      error.value = failure instanceof Error ? failure.message : '候选创建失败'
  } finally {
    busy.value = false
  }
}
watch(
  () => [opened.value, props.sceneId],
  () => {
    generation++
    if (!opened.value) return
    page.value = 1
    history.value = null
    preview.value = null
    void load()
  }
)
</script>
<template>
  <ElDrawer v-model="opened" title="完整历史版本与回退" size="min(960px, 95vw)">
    <p>回退复制整个场景版本，包含原图、文字、音频、时间和词条引用；发布前仍会重新检查。</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" /><ElButton @click="load"
      >刷新历史</ElButton
    >
    <ElTable v-loading="busy" :data="history?.items ?? []"
      ><ElTableColumn label="版本" prop="version_no" width="70" /><ElTableColumn
        label="英文标题"
        prop="title_en"
        min-width="180"
      /><ElTableColumn label="状态" width="140"
        ><template #default="{ row }"
          >{{ row.status }} {{ row.is_current ? '· 当前线上' : '' }}</template
        ></ElTableColumn
      ><ElTableColumn label="创建时间" prop="created_at" min-width="160" /><ElTableColumn
        label="操作"
        width="210"
        ><template #default="{ row }"
          ><ElButton :disabled="busy" link @click="view(row.id)">查看完整版本</ElButton
          ><ElButton
            v-if="['PUBLISHED', 'SUPERSEDED'].includes(row.status)"
            :disabled="busy"
            link
            @click="restore(row.id)"
            >创建回退候选</ElButton
          ></template
        ></ElTableColumn
      ></ElTable
    >
    <ElPagination
      v-model:current-page="page"
      :page-size="20"
      :total="history?.total ?? 0"
      layout="total, prev, pager, next"
      @current-change="load"
    />
    <ScenePreview
      v-if="preview"
      :key="preview.id"
      :revision-id="preview.id"
      :content="preview.content"
    />
  </ElDrawer>
</template>

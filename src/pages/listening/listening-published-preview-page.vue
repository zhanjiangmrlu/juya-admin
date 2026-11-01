<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import ListeningPreviewPanel from '@/features/listening/listening-preview-panel.vue'
import { listeningBase, listeningRequest } from '@/services/listening-service'

import type { Article, Category } from '@/features/listening/listening-types'

const route = useRoute(),
  router = useRouter(),
  articleId = encodeURIComponent(String(route.params.id))
const { data, busy, error, refresh } = useResource(() =>
  listeningRequest<Article>(`/articles/${articleId}/published`)
)
const categories = useResource(() => listeningRequest<{ items: Category[] }>('/categories'))
const previewArticle = computed(() => {
  if (!data.value) return null
  const categoryId = data.value.published_category_id || data.value.category_id
  return {
    ...data.value,
    category_id: categoryId,
    category_name:
      categories.data.value?.items.find((item) => item.id === categoryId)?.name ||
      data.value.category_name
  }
})
const mediaBase = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}${listeningBase}/articles/${articleId}/published/media`
/** 返回用户记录的来源位置，直接进入时回到用户列表 */
const back = () => {
  if (window.history.state.back) router.back()
  else void router.push('/users')
}
onMounted(() => {
  void refresh()
  // 目录名称独立读取，失败或延迟不阻塞发布正文
  void categories.refresh()
})
</script>
<template>
  <div class="published-preview-page">
    <div class="page-heading between">
      <div>
        <h1>听读发布内容预览</h1>
        <p>当前有效发布内容只读，查看不会代用户完成、收藏或打卡。</p>
      </div>
      <button type="button" @click="back">返回用户记录</button>
    </div>
    <AppState :busy="busy" :error="error" @retry="refresh" />
    <ListeningPreviewPanel
      v-if="previewArticle && !busy && !error"
      :article="previewArticle"
      :media-base="mediaBase"
      :pronunciation="
        previewArticle.version_id
          ? {
              path: `/api/admin/v1/listening/articles/${previewArticle.id}`,
              reference: { version_id: previewArticle.version_id }
            }
          : undefined
      "
      source-label="当前发布版 · 只读预览"
      :readonly="true"
    />
  </div>
</template>

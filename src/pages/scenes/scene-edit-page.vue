<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import { useWordPronunciation } from '@/composables/use-word-pronunciation'
import {
  blankContent,
  type CardPreview,
  type CardView,
  prepareContent,
  type SceneContent
} from '@/features/scenes/editor-model'
import SceneContentForm from '@/features/scenes/scene-content-form.vue'
import SceneDocxImport from '@/features/scenes/scene-docx-import.vue'
import ScenePreview from '@/features/scenes/scene-preview.vue'
import { queryURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'
import { registerLogoutGuard } from '@/services/logout-guard'
import { loadPronunciation } from '@/services/pronunciation-service'

import type { components } from '@/shared/contracts/generated/admin-api'
const route = useRoute(),
  router = useRouter(),
  content = ref<SceneContent>(blankContent()),
  saved = ref<CardView | null>(null),
  baseline = ref(JSON.stringify(blankContent()))
const limits = ref<components['schemas']['UploadConfiguration'] | null>(null),
  loading = ref(true),
  busy = ref(false),
  uploading = ref(false),
  readingDocx = ref(false),
  error = ref(''),
  issues = ref<{ field?: string; message?: string }[]>([])
const preview = ref<CardPreview | null>(null),
  publishError = ref(''),
  leaveOpen = ref(false)
const dirty = computed(() => JSON.stringify(content.value) !== baseline.value)
const draftSpeech = useWordPronunciation(async (wordId, active) => {
  if (!(await save()) || !saved.value || !active()) throw new Error('请先保存资料后试听')
  const path = `/api/admin/v1/cards/${encodeURIComponent(saved.value.id)}/words/${encodeURIComponent(wordId)}/pronunciation`
  const url = await loadPronunciation(
    {
      active,
      pause: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      request: (method, path, reference) =>
        api.request<components['schemas']['SpeechState']>(
          method === 'GET' ? queryURL(path, reference) : path,
          method === 'POST' ? { method, body: reference } : {}
        )
    },
    path,
    { revision: saved.value.draft_revision }
  )
  if (!url.startsWith('/api/admin/v1/')) throw new Error('发音地址暂不可用')
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + url
})
const pronunciationState = computed(() => ({
  current: draftSpeech.current.value,
  status: draftSpeech.status.value,
  error: draftSpeech.error.value
}))
watch(
  content,
  () => {
    if (dirty.value) draftSpeech.stop()
  },
  { deep: true }
)
let saving: { fingerprint: string; run: () => Promise<CardView> } | null = null,
  publishing: (() => Promise<CardView>) | null = null,
  resolveLeave: ((allow: boolean) => void) | null = null
let committedNavigation = false
const back = computed(() => String(route.query.back || '/cards'))
/** 使用服务端规范化值更新编辑基准
 * @param card 已提交的卡片及草稿版本
 */
const accept = (card: CardView) => {
  saved.value = card
  content.value = {
    ...card.content,
    dialogue: card.content.dialogue || [],
    vocabulary: card.content.vocabulary || [],
    chunks: card.content.chunks || []
  }
  baseline.value = JSON.stringify(content.value)
  saving = null
  preview.value = null
}
/** 读取现有候选和本环境上传限制 */
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const [configuration, card] = await Promise.all([
      api.request<components['schemas']['UploadConfiguration']>(
        '/api/admin/v1/media/configuration'
      ),
      route.params.id === 'new'
        ? Promise.resolve(null)
        : api.request<CardView>(`/api/admin/v1/cards/${route.params.id}`)
    ])
    limits.value = configuration
    if (card) accept(card)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}
/** 保存允许不完整的草稿；未知网络结果保留同一操作键
 * @returns 是否保存成功
 */
const save = async () => {
  if (busy.value || uploading.value || readingDocx.value) return false
  if (saved.value && !dirty.value && !saving) return true
  busy.value = true
  error.value = ''
  issues.value = []
  try {
    let body = saved.value
      ? { revision: saved.value.draft_revision, content: prepareContent(content.value) }
      : { content: prepareContent(content.value) }
    let fingerprint = JSON.stringify(body)
    if (saving && saving.fingerprint !== fingerprint) {
      // 先收尾已提交但回执未知的原操作，再用返回修订保存当前输入
      const wanted = prepareContent(content.value)
      const recovered = await saving.run()
      saved.value = recovered
      baseline.value = JSON.stringify(recovered.content)
      preview.value = null
      saving = null
      content.value = wanted
      body = { revision: recovered.draft_revision, content: wanted }
      fingerprint = JSON.stringify(body)
    }
    if (!saving)
      saving = {
        fingerprint,
        run: api.operation<CardView>(
          saved.value ? 'PUT' : 'POST',
          saved.value ? `/api/admin/v1/cards/${saved.value.id}` : '/api/admin/v1/cards',
          body
        )
      }
    const card = await saving.run()
    accept(card)
    if (route.params.id === 'new')
      await router.replace({ path: `/cards/${card.id}`, query: route.query })
    ElMessage.success('草稿已保存')
    return true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请重试'
    if (reason instanceof ApiError) {
      issues.value = reason.details
      if (reason.status >= 400 && reason.status < 500 && ![408, 429].includes(reason.status))
        saving = null
    }
    return false
  } finally {
    busy.value = false
  }
}
/** 预览必须基于当前已保存版本，失败定位待补充资料 */
const openPreview = async () => {
  if (!(await save()) || !saved.value) return
  busy.value = true
  error.value = ''
  issues.value = []
  try {
    preview.value = await api.request(`/api/admin/v1/cards/${saved.value.id}/preview`, {
      method: 'POST',
      body: { revision: saved.value.draft_revision }
    })
    publishing = api.operation<CardView>('POST', `/api/admin/v1/cards/${saved.value.id}/publish`, {
      revision: preview.value!.revision,
      preview_id: preview.value!.preview_id
    })
    publishError.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览失败'
    if (reason instanceof ApiError) issues.value = reason.details
    document.querySelector('#publication-issues')?.scrollIntoView({ block: 'center' })
  } finally {
    busy.value = false
  }
}
/** 仅发布这次已核对的预览版本，失败留在确认层 */
const publish = async () => {
  if (!publishing || busy.value) return
  busy.value = true
  publishError.value = ''
  try {
    const card = await publishing()
    accept(card)
    ElMessage.success('场景卡已发布')
    committedNavigation = true
    await router.push(back.value)
  } catch (reason) {
    publishError.value = reason instanceof Error ? reason.message : '发布失败，草稿已保留'
  } finally {
    committedNavigation = false
    busy.value = false
  }
}
/** 原生关闭页面时提示未保存资料
 * @param event 浏览器离开事件
 */
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value || uploading.value || readingDocx.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
/** 处理离开编辑页的三个明确选择
 * @param decision 继续编辑、保存或放弃
 */
const leave = async (decision: 'continue' | 'save' | 'discard') => {
  if (decision === 'save' && !(await save())) return
  const allow = decision !== 'continue'
  leaveOpen.value = false
  resolveLeave?.(allow)
  resolveLeave = null
}
let pendingLeave: Promise<boolean> | null = null
/** 导航与退出登录共用同一份未保存确认
 * @returns 是否明确允许离开
 */
const confirmLeaving = (): Promise<boolean> => {
  if (busy.value || uploading.value || readingDocx.value) {
    ElMessage.info('请等待当前操作完成')
    return Promise.resolve(false)
  }
  if (!dirty.value) return Promise.resolve(true)
  if (pendingLeave) return pendingLeave
  leaveOpen.value = true
  pendingLeave = new Promise<boolean>((resolve) => {
    resolveLeave = resolve
  }).finally(() => {
    pendingLeave = null
  })
  return pendingLeave
}
const unregisterLogoutGuard = registerLogoutGuard(confirmLeaving)
onBeforeRouteLeave((to) => (to.path === '/login' || committedNavigation ? true : confirmLeaving()))
onMounted(() => {
  void load()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  unregisterLogoutGuard()
  window.removeEventListener('beforeunload', beforeUnload)
  resolveLeave?.(false)
})
</script>
<template>
  <div class="editor-page">
    <div class="page-heading">
      <RouterLink :to="back" class="back-link">‹ 返回卡片管理</RouterLink>
      <div class="between">
        <h1>{{ saved ? content.name || '未命名草稿' : '新建卡片' }}</h1>
        <span class="badge">{{
          saved ? (saved.status === 'published' ? '编辑候选稿' : '编辑草稿') : '尚未保存'
        }}</span>
      </div>
      <p v-if="saved?.status === 'published'">保存候选稿不会影响当前线上内容，预览确认后整体发布</p>
    </div>
    <AppState :busy="loading" :error="loading ? '' : error" @retry="load" /><template
      v-if="!loading"
      ><div v-if="issues.length" id="publication-issues" class="notice error" role="alert">
        <strong>请先补充以下资料</strong>
        <ul>
          <li v-for="(issue, index) in issues" :key="index">{{ issue.message }}</li>
        </ul>
      </div>
      <SceneDocxImport
        :content="content"
        :disabled="busy || uploading"
        @apply="content = $event"
        @busy="readingDocx = $event"
      />
      <SceneContentForm
        v-model="content"
        :limits="limits"
        :pronunciation="pronunciationState"
        :save-before-pronounce="dirty || !saved"
        :pronunciation-disabled="busy || uploading || readingDocx"
        :disabled="busy"
        @pronounce="draftSpeech.play"
        @uploading="uploading = $event"
      />
      <footer class="editor-actions">
        <span class="muted small">{{
          uploading ? '素材正在处理，请稍候' : dirty ? '有未保存修改' : saved ? '草稿已保存' : ''
        }}</span
        ><button type="button" :disabled="busy || uploading || readingDocx" @click="save">
          {{ busy ? '正在处理…' : '保存草稿' }}</button
        ><button
          type="button"
          class="primary"
          :disabled="busy || uploading || readingDocx"
          @click="openPreview"
        >
          预览并发布
        </button>
      </footer></template
    ><ScenePreview
      v-if="preview"
      :content="preview.content"
      :pronunciation="
        saved ? { cardId: saved.id, reference: { revision: preview.revision } } : undefined
      "
      mode="draft"
      :busy="busy"
      :error="publishError"
      @close="!busy && (preview = null)"
      @publish="publish"
    /><ElDialog
      v-model="leaveOpen"
      title="资料尚未保存"
      width="470px"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      ><p>离开前可以保存草稿，或放弃本次未保存修改。</p>
      <template #footer
        ><button :disabled="busy" @click="leave('continue')">继续编辑</button>
        <button :disabled="busy" @click="leave('discard')">放弃修改</button>
        <button class="primary" :disabled="busy" @click="leave('save')">
          保存后离开
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.editor-page {
  max-width: 1000px;
  margin: auto;

  .back-link {
    display: block;
    font-size: 12px;
    margin-bottom: 16px;
  }

  .editor-actions {
    align-items: center;

    span {
      margin-right: auto;
    }
  }
}
</style>

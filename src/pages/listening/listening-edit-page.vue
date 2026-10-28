<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppFilePicker from '@/components/app-file-picker/app-file-picker.vue'
import AppState from '@/components/app-state/app-state.vue'
import ListeningContentForm from '@/features/listening/listening-content-form.vue'
import ListeningDocxImport from '@/features/listening/listening-docx-import.vue'
import { emptyPayload, publishErrors, statusLabels } from '@/features/listening/listening-model'
import ListeningReader from '@/features/listening/listening-reader.vue'
import ListeningTimeline from '@/features/listening/listening-timeline.vue'
import SceneAudio from '@/features/scenes/scene-audio.vue'
import { api } from '@/services/http-client'
import {
  listeningBase,
  listeningMediaURL,
  listeningOperation,
  listeningRecoverableOperation,
  listeningRequest
} from '@/services/listening-service'

import type { Article, ArticlePayload, Topic } from '@/features/listening/listening-types'

const route = useRoute(),
  router = useRouter()
const article = ref<Article | null>(null),
  payload = ref(emptyPayload()),
  topic = ref(''),
  topics = ref<Topic[]>([]),
  busy = ref(false),
  error = ref(''),
  savedSnapshot = ref(''),
  notice = ref(''),
  preview = ref<{ article: Article; preview_token: string; errors: string[] } | null>(null),
  previewOpen = ref(false),
  upload = ref(''),
  form = ref<InstanceType<typeof ListeningContentForm> | null>(null)
const snapshot = computed(() => JSON.stringify({ topic_id: topic.value, payload: payload.value }))
const dirty = computed(() => snapshot.value !== savedSnapshot.value)
const localErrors = computed(() => publishErrors(payload.value, topic.value))
let pendingSave: {
  snapshot: string
  operation: ReturnType<typeof listeningRecoverableOperation<Article>>
} | null = null
/** 将服务端已确认的文章加载到表单
 * @param value 当前真实文章及乐观版本
 */
const accept = (value: Article) => {
  article.value = value
  payload.value = structuredClone(value.payload)
  topic.value = value.topic_id
  savedSnapshot.value = snapshot.value
  pendingSave = null
}
/** 读取真实资料，失败不补造草稿或主题 */
const load = async () => {
  busy.value = true
  error.value = ''
  try {
    topics.value = (await listeningRequest<{ items: Topic[] }>('/topics')).items
    if (route.params.id !== 'new')
      accept(await listeningRequest<Article>(`/articles/${route.params.id}`))
    else savedSnapshot.value = snapshot.value
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '读取失败'
  } finally {
    busy.value = false
  }
}
/** 保存允许缺项的草稿，未知响应保持同一操作键
 * @returns 服务端已确认的文章，失败为空
 */
const save = async (): Promise<Article | null> => {
  if (!topic.value) {
    error.value = '请选择主题后保存草稿'
    return null
  }
  if (form.value?.meaningError) {
    error.value = '请先修正词义资料格式'
    return null
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const body = {
      topic_id: topic.value,
      payload: JSON.parse(JSON.stringify(payload.value)) as ArticlePayload,
      ...(article.value ? { revision: article.value.revision } : {})
    }
    const currentSnapshot = snapshot.value
    if (pendingSave) {
      const originalSnapshot = pendingSave.snapshot
      const confirmed = await pendingSave.operation.run()
      accept(confirmed)
      if (originalSnapshot === currentSnapshot) {
        notice.value = '草稿已保存；只有明确发布才更新学习端'
        if (route.params.id === 'new') await router.replace(`/listening/${confirmed.id}`)
        return confirmed
      }
      // 原创建已确认才可把当前输入作为该身份的新版本更新
      const current = JSON.parse(currentSnapshot) as { topic_id: string; payload: ArticlePayload }
      payload.value = current.payload
      topic.value = current.topic_id
      body.revision = confirmed.revision
      body.topic_id = current.topic_id
      body.payload = current.payload
    }
    if (!pendingSave)
      pendingSave = {
        snapshot: snapshot.value,
        operation: listeningRecoverableOperation<Article>(
          article.value ? 'PUT' : 'POST',
          article.value ? `/articles/${article.value.id}` : '/articles',
          body
        )
      }
    const value = await pendingSave.operation.run()
    accept(value)
    notice.value = '草稿已保存；只有明确发布才更新学习端'
    if (route.params.id === 'new') await router.replace(`/listening/${value.id}`)
    return value
  } catch (reason) {
    if (pendingSave && !pendingSave.operation.unknown) pendingSave = null
    error.value = reason instanceof Error ? reason.message : '保存失败，输入已保留'
    return null
  } finally {
    busy.value = false
  }
}
/** 先持久化当前编辑稿，再读取不写成绩的预览与发布核对 */
const showPreview = async () => {
  const value = dirty.value || !article.value ? await save() : article.value
  if (!value) return
  busy.value = true
  error.value = ''
  try {
    preview.value = await listeningOperation<{
      article: Article
      preview_token: string
      errors: string[]
    }>('POST', `/articles/${value.id}/preview`, {
      revision: value.revision
    })()
    previewOpen.value = true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览读取失败'
  } finally {
    busy.value = false
  }
}
/** 发布已预览的版本并展示结果，失败时保留弹窗内的错误说明 */
const publish = async () => {
  if (!article.value || !preview.value || preview.value.errors.length) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    accept(
      await listeningOperation<Article>('POST', `/articles/${article.value.id}/publish`, {
        revision: article.value.revision,
        preview_token: preview.value.preview_token
      })()
    )
    previewOpen.value = false
    notice.value = '文章已发布新版本'
    ElMessage.success(notice.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '发布失败，请刷新确认'
  } finally {
    busy.value = false
  }
}
/** 上传原文件并仅在素材就绪后替换当前有效资源
 * @param event 文件选择事件
 * @param kind 完整音频或可选原图
 */
const uploadMedia = async (event: Event, kind: 'audio' | 'image') => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const value = article.value || (await save())
  if (!value) {
    input.value = ''
    return
  }
  busy.value = true
  error.value = ''
  upload.value = '等待上传'
  const body = new FormData()
  body.append('file', file)
  try {
    const media = await api.upload<{ id: string; state: string }>(
      `${listeningBase}/articles/${value.id}/media?kind=${kind}`,
      body,
      crypto.randomUUID(),
      (progress) => {
        upload.value =
          progress.percent === null
            ? `已上传 ${progress.loaded} 字节`
            : `上传 ${progress.percent}%${progress.percent === 100 ? '，正在校验处理' : ''}`
      }
    )
    upload.value = `${file.name} · ${statusLabels[media.state] || media.state}`
    if (media.state === 'ready') {
      if (kind === 'audio') payload.value.audio_id = media.id
      else payload.value.image_id = media.id
    } else error.value = '素材尚未就绪，原有效素材保留；请处理后重新上传'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '上传失败，原有效素材保留'
  } finally {
    busy.value = false
    input.value = ''
  }
}
/** 用户明确放弃本地修改后重新读取真实版本 */
const reload = () => {
  if (!dirty.value || window.confirm('重新读取将放弃尚未保存的修改，是否继续？')) void load()
}
onBeforeRouteLeave(() => !dirty.value || window.confirm('文章尚有未保存修改，是否离开？'))
onMounted(load)
</script>
<template>
  <div class="listening-edit">
    <div class="page-heading between">
      <div>
        <h1>{{ article ? '编辑听读文章' : '新建听读文章' }}</h1>
        <p>保存草稿 → 预览核对 → 明确发布</p>
      </div>
      <RouterLink class="button-link" :to="String(route.query.back || '/listening')"
        >返回文章管理</RouterLink
      >
    </div>
    <AppState :error="error" @retry="reload" />
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="article" class="muted small">
      {{ statusLabels[article.status] }} · 版本 {{ article.revision }} ·
      {{ article.word_count }} 词<span v-if="article.status === 'published'">
        · 编辑稿不会替换当前发布内容</span
      >
    </p>
    <div v-if="article?.status !== 'deleted'" class="editor-grid">
      <section class="panel">
        <ListeningDocxImport :payload="payload" :disabled="busy" @apply="payload = $event" />
        <ListeningContentForm
          ref="form"
          v-model="payload"
          v-model:topic="topic"
          :topics="topics"
          :disabled="busy"
        />
      </section>
      <aside class="panel media-panel">
        <h2>全文音频与原图</h2>
        <label class="field"
          >完整英文音频<AppFilePicker
            label="选择完整英文音频"
            accept=".mp3,.m4a,.wav,.aac"
            :disabled="busy"
            @change="uploadMedia($event, 'audio')" /></label
        ><SceneAudio
          v-if="article && payload.audio_id"
          :media-id="payload.audio_id"
          :source-url="listeningMediaURL(article.id, payload.audio_id)"
          variant="preview"
          compact
          inline-rates
          title="完整英文音频"
          subtitle="LISTEN TO THE FULL ARTICLE"
        /><label class="field"
          >文章原图（选填）<AppFilePicker
            label="选择文章原图"
            accept="image/*"
            :disabled="busy"
            @change="uploadMedia($event, 'image')" /></label
        ><img
          v-if="article && payload.image_id"
          :src="listeningMediaURL(article.id, payload.image_id)"
          alt="当前文章配图"
        /><button
          v-if="payload.image_id"
          type="button"
          class="text"
          :disabled="busy"
          @click="payload.image_id = null"
        >
          取消选填配图
        </button>
        <p v-if="upload" class="muted small" role="status">{{ upload }}</p>
        <ListeningTimeline v-if="article" :article-id="article.id" :revision="article.revision" />
        <h3 class="validation-title">发布资料核对</h3>
        <ul v-if="localErrors.length" class="muted small">
          <li v-for="item in localErrors" :key="item">{{ item }}</li>
        </ul>
        <p v-else class="muted small">基础资料已齐；音频就绪与有效归属由服务端发布前校验</p>
      </aside>
    </div>
    <p v-else class="notice error">文章已删除，不能编辑或重新发布</p>
    <div v-if="article?.status !== 'deleted'" class="editor-actions">
      <span class="muted" role="status">
        <template v-if="article"
          >{{ statusLabels[article.status] }} · 版本 {{ article.revision }} ·
        </template>
        {{ dirty ? '有未保存修改' : '已与服务器同步' }}</span
      ><button :disabled="busy" @click="save">{{ busy ? '处理中…' : '保存草稿' }}</button
      ><button class="primary" :disabled="busy" @click="showPreview">预览并核对发布</button>
    </div>
    <ElDialog
      v-model="previewOpen"
      class="listening-article-preview"
      body-class="preview-body"
      title="当前编辑稿预览"
      width="900px"
      :close-on-click-modal="false"
      destroy-on-close
      ><p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <template v-if="preview"
        ><div v-if="preview.errors.length" class="notice error">
          <p>当前资料不能发布，仍可预览草稿</p>
          <ul>
            <li v-for="item in preview.errors" :key="item">{{ item }}</li>
          </ul>
        </div>
        <ListeningReader :article="preview.article" /></template
      ><template #footer
        ><button :disabled="busy" @click="previewOpen = false">返回修改</button
        ><button
          class="primary"
          :disabled="busy || Boolean(preview?.errors.length)"
          @click="publish"
        >
          {{ busy ? '发布中…' : '确认发布这一版' }}
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.listening-edit {
  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    align-items: start;
    gap: 24px;
    margin-top: 20px;
  }

  .media-panel {
    img {
      width: 100%;
      max-height: 280px;
      object-fit: contain;
    }

    audio {
      width: 100%;
    }

    .validation-title {
      margin-top: 24px;
    }
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    align-items: center;
    position: sticky;
    bottom: 0;
    padding: 18px 0;
    background: var(--bg);
    border-top: 1px solid var(--line);
    margin-top: 24px;

    span {
      margin-right: auto;
    }
  }

  @media (width <= 1100px) {
    .editor-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>

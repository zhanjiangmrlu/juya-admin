<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppFilePicker from '@/components/app-file-picker/app-file-picker.vue'
import AppState from '@/components/app-state/app-state.vue'
import ListeningContentForm from '@/features/listening/listening-content-form.vue'
import ListeningDocxImport from '@/features/listening/listening-docx-import.vue'
import { emptyPayload, publishErrors, statusLabels } from '@/features/listening/listening-model'
import ListeningPreviewPanel from '@/features/listening/listening-preview-panel.vue'
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

import type { Article, ArticlePayload, Category, Topic } from '@/features/listening/listening-types'

const route = useRoute(),
  router = useRouter()
const article = ref<Article | null>(null),
  payload = ref(emptyPayload()),
  topic = ref(''),
  topics = ref<Topic[]>([]),
  categories = ref<Category[]>([]),
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
const pendingPublication = shallowRef<ReturnType<
  typeof listeningRecoverableOperation<Article>
> | null>(null)
const canPublish = computed(
  () => !publishErrors(payload.value, topic.value).length && article.value?.status !== 'deleted'
)
let previewReturnScroll = 0
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
    const [topicResult, categoryResult] = await Promise.all([
      listeningRequest<{ items: Topic[] }>('/topics'),
      listeningRequest<{ items: Category[] }>('/categories')
    ])
    topics.value = topicResult.items
    categories.value = categoryResult.items
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
  const returnScroll = window.scrollY
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
    previewReturnScroll = returnScroll
    previewOpen.value = true
    await nextTick()
    window.scrollTo(0, 0)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览读取失败'
  } finally {
    busy.value = false
  }
}
/** 关闭整页预览，保留编辑实例与已核对版本并返回原编辑位置 */
const closePreview = async () => {
  if (!previewOpen.value) return
  previewOpen.value = false
  await nextTick()
  window.scrollTo(0, previewReturnScroll)
}
/** 手动保存草稿后回到原文章列表，上传或可选预览的自动暂存仍留在编辑页 */
const saveDraft = async () => {
  if (busy.value || pendingPublication.value) return
  const value = await save()
  if (value) await router.push(String(route.query.back || '/listening'))
}
/** 明确发布当前输入，自动保存编辑稿，未知结果按原操作恢复 */
const publish = async () => {
  if (busy.value || (!canPublish.value && !pendingPublication.value)) return
  const value = pendingPublication.value
    ? article.value
    : dirty.value || !article.value
      ? await save()
      : article.value
  if (!value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    pendingPublication.value ||= listeningRecoverableOperation<Article>(
      'POST',
      `/articles/${value.id}/publish`,
      { revision: value.revision }
    )
    accept(await pendingPublication.value.run())
    pendingPublication.value = null
    await closePreview()
    ElMessage.success('文章已发布')
    await router.push(String(route.query.back || '/listening'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '发布结果未确认，请重试'
    if (!pendingPublication.value?.unknown) pendingPublication.value = null
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
    <div v-show="!previewOpen" class="edit-workspace">
      <div class="page-heading between">
        <div>
          <h1>{{ article ? '编辑听读文章' : '新建听读文章' }}</h1>
          <p>补齐资料后选择发布或保存草稿，预览和试听可选</p>
        </div>
        <div class="row heading-actions">
          <RouterLink class="button-link" :to="String(route.query.back || '/listening')"
            >返回文章管理</RouterLink
          ><ListeningDocxImport
            :payload="payload"
            :disabled="busy"
            compact
            @apply="payload = $event"
            @topic="topic = $event"
          />
        </div>
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
        <div class="editor-content">
          <ListeningContentForm
            ref="form"
            v-model="payload"
            v-model:topic="topic"
            :topics="topics"
            :categories="categories"
            :disabled="busy || Boolean(pendingPublication)"
          >
            <template #media>
              <section class="panel content-card">
                <h2>完整英文音频 *</h2>
                <p class="muted small">上传已准备好的完整音频，支持MP3／M4A／WAV／AAC</p>
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
                />
                <ListeningTimeline
                  v-if="article"
                  :article-id="article.id"
                  :revision="article.revision"
                />
              </section>
              <section class="panel content-card">
                <h2>本篇原图 <small class="muted">选填</small></h2>
                <p class="muted small">可不上传，无图时不显示阅读页图片入口</p>
                <label class="field"
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
              </section>
              <p v-if="upload" class="muted small" role="status">{{ upload }}</p>
            </template>
          </ListeningContentForm>
        </div>
        <aside class="panel save-panel">
          <h2>保存与发布</h2>
          <dl>
            <div>
              <dt>当前状态</dt>
              <dd>{{ article ? statusLabels[article.status] : '未保存' }}</dd>
            </div>
            <div>
              <dt>英文词数</dt>
              <dd>{{ article?.word_count ?? '保存后计算' }}</dd>
            </div>
            <div>
              <dt>语块完整性</dt>
              <dd>
                {{
                  payload.expressions.filter(
                    (item) => item.english.trim() && item.chinese.trim() && item.example.trim()
                  ).length
                }}
                / 5组
              </dd>
            </div>
            <div>
              <dt>完整音频</dt>
              <dd>{{ payload.audio_id ? '已选择' : '待上传' }}</dd>
            </div>
          </dl>
          <div class="save-actions">
            <span class="muted small" role="status"
              >{{ article ? `${statusLabels[article.status]} · 版本 ${article.revision} · ` : ''
              }}{{ dirty ? '有未保存修改' : '已与服务器同步' }}</span
            ><button :disabled="busy || Boolean(pendingPublication)" @click="saveDraft">
              {{ busy ? '处理中…' : '保存草稿' }}</button
            ><button :disabled="busy || Boolean(pendingPublication)" @click="showPreview">
              预览（可选）</button
            ><button class="primary" :disabled="busy || !canPublish" @click="publish">
              {{ pendingPublication ? '重试发布' : '发布' }}
            </button>
          </div>
          <p class="publish-guidance muted small">
            发布需双标题、有效分类与主题、英文正文、全文译文、完整5组语块和已就绪的全文音频
          </p>
          <p class="publish-guidance muted small">原图、预览和试听均可选；发布仍校验全部必填资料</p>
        </aside>
      </div>
      <p v-else class="notice error">文章已删除，不能编辑或重新发布</p>
    </div>
    <section v-if="previewOpen && preview" class="preview-workspace">
      <div class="page-heading between">
        <div>
          <h1>文章预览</h1>
          <p>核对当前编辑稿的排版与资料完整性</p>
        </div>
        <div class="row">
          <button :disabled="busy" @click="closePreview">返回修改</button
          ><button class="primary" :disabled="busy || !canPublish" @click="publish">
            {{ busy ? '发布中…' : '确认发布这一版' }}
          </button>
        </div>
      </div>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <div v-if="preview.errors.length" class="notice error">
        <p>当前资料不能发布，仍可预览草稿</p>
        <ul>
          <li v-for="item in preview.errors" :key="item">{{ item }}</li>
        </ul>
      </div>
      <ListeningPreviewPanel
        :article="{
          ...preview.article,
          topic_name: topics.find((item) => item.id === preview?.article.topic_id)?.name,
          category_name: categories.find(
            (item) =>
              item.id === topics.find((item) => item.id === preview?.article.topic_id)?.category_id
          )?.name
        }"
      />
    </section>
  </div>
</template>
<style scoped lang="scss">
.listening-edit {
  .heading-actions {
    align-items: start;
  }

  .publish-guidance {
    margin-top: 16px;
    font-size: 11px;
    line-height: 1.85;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 288px;
    align-items: start;
    gap: 24px;
    margin-top: 20px;
  }

  .editor-content {
    min-width: 0;

    .content-card {
      padding: 22px;
      margin-bottom: 20px;
    }
  }

  .save-panel {
    position: sticky;
    top: 20px;
    padding: 22px;

    h2 {
      font-size: 17px;
      margin-bottom: 20px;
    }

    dl > div {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
      padding: 12px 0;
      font-size: 12px;
    }

    dd {
      margin: 0;
    }
  }

  .editor-content {
    img {
      width: 100%;
      max-height: 280px;
      object-fit: contain;
    }

    audio {
      width: 100%;
    }
  }

  .save-actions {
    position: static;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;

    button {
      width: 100%;
    }
  }

  @media (width <= 1100px) {
    .editor-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onActivated, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { statusLabels, topicLabel } from '@/features/listening/listening-model'
import ListeningPreviewPanel from '@/features/listening/listening-preview-panel.vue'
import ListeningSettings from '@/features/listening/listening-settings.vue'
import { dateText, queryURL } from '@/services/display'
import {
  listeningOperation,
  listeningRecoverableOperation,
  listeningRequest
} from '@/services/listening-service'

import type {
  Article,
  Category,
  DeleteResult,
  FreePolicy,
  Page,
  Topic
} from '@/features/listening/listening-types'
import type { components } from '@/shared/contracts/generated/admin-api'

defineOptions({ name: 'ListeningListPage' })
const route = useRoute(),
  router = useRouter()
const data = ref<Page<Article> | null>(null),
  topics = ref<Topic[]>([]),
  categories = ref<Category[]>([]),
  policy = ref<FreePolicy | null>(null),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  selected = ref<string[]>([]),
  search = ref(String(route.query.q || '')),
  settings = ref<'hierarchy' | 'order' | 'free' | null>(null),
  preview = ref<Article | null>(null),
  targets = ref<Article[]>([]),
  confirmOpen = ref(false),
  results = ref<DeleteResult | null>(null),
  deleting = ref(false),
  unknownDelete = ref(false),
  offline = ref<Article | null>(null)
type PublicationResult = components['schemas']['BatchPublishResult']
const publicationResult = ref<PublicationResult | null>(null),
  publicationTargets = ref<Article[]>([])
const pendingPublication = shallowRef<ReturnType<
  typeof listeningRecoverableOperation<PublicationResult>
> | null>(null)
const selectedPublications = computed(
  () =>
    data.value?.items.filter(
      (item) =>
        selected.value.includes(item.id) &&
        (item.status !== 'published' || item.has_unpublished_changes)
    ) || []
)
/** 使用原操作查询或恢复明确选择的发布集合 */
const recoverPublication = async () => {
  if (!pendingPublication.value || deleting.value) return
  deleting.value = true
  error.value = ''
  try {
    const value = await pendingPublication.value.run()
    pendingPublication.value = null
    publicationResult.value = value.items.some((item) => item.status === 'failed') ? value : null
    selected.value = []
    if (!publicationResult.value) ElMessage.success('文章发布完成')
    await load()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '发布结果未确认，请重试'
    if (!pendingPublication.value?.unknown) pendingPublication.value = null
  } finally {
    deleting.value = false
  }
}
/** 发布行内或当前页明确选择的版本，不把其他勾选项混入行内操作
 * @param items 本次明确选择的合格文章集合
 */
const publishArticles = async (items: Article[]) => {
  if (deleting.value || pendingPublication.value || !items.length) return
  publicationTargets.value = items.map((item) => ({ ...item }))
  pendingPublication.value = listeningRecoverableOperation<PublicationResult>(
    'POST',
    '/articles/batch-publish',
    { items: items.map(({ id, revision }) => ({ id, revision })) }
  )
  await recoverPublication()
}
/** 刷新后仅重新选择原失败项，管理员核对当前版本再明确发布 */
const selectPublicationFailures = async () => {
  const ids =
    publicationResult.value?.items
      .filter((item) => item.status === 'failed')
      .map((item) => item.id) || []
  await load()
  selected.value =
    data.value?.items.filter((item) => ids.includes(item.id)).map((item) => item.id) || []
}
/** M保存成功后关闭弹窗并刷新当前真实列表 */
const settingsChanged = () => {
  if (settings.value === 'free') settings.value = null
  void load()
}
const page = computed(() => Math.max(1, Number(route.query.page) || 1)),
  category = computed(() => String(route.query.category_id || '')),
  topic = computed(() => String(route.query.topic_id || '')),
  status = computed(() => String(route.query.status || '')),
  allSelected = computed(() =>
    Boolean(data.value?.items.length && selected.value.length === data.value.items.length)
  ),
  partialSelected = computed(() => selected.value.length > 0 && !allSelected.value)
const filterTopics = computed(() =>
  topics.value.filter((item) => !category.value || item.category_id === category.value)
)
let generation = 0
let previousQuery = route.fullPath,
  scrollTop = 0,
  previewReturnScroll = 0,
  activated = false
/** 展示当前文章真实分类和主题归属
 * @param topicId 文章当前主题编号
 * @returns 可识别的分类与主题路径
 */
const topicPath = (topicId: string) => {
  const value = topics.value.find((item) => item.id === topicId)
  return value
    ? `${categories.value.find((item) => item.id === value.category_id)?.name || '分类待核对'} / ${topicLabel(value)}`
    : '归属待核对'
}
/** 读取当前页真实列表并回退到最近有效页 */
const load = async () => {
  const run = ++generation
  busy.value = true
  error.value = ''
  try {
    const value = await listeningRequest<Page<Article>>(
      queryURL('/articles', {
        page: page.value,
        limit: 10,
        topic_id: topic.value || undefined,
        category_id: category.value || undefined,
        status: status.value || undefined,
        q: route.query.q || undefined,
        batch_id: route.query.batch_id || undefined
      })
    )
    if (run !== generation) return
    if (page.value > 1 && !value.items.length) {
      await router.replace({
        query: { ...route.query, page: Math.max(1, Math.ceil(value.total / 10)) }
      })
      return
    }
    data.value = value
    selected.value = selected.value.filter((id) => value.items.some((item) => item.id === id))
    const [p, t, c] = await Promise.all([
      listeningRequest<FreePolicy>('/free-policy'),
      listeningRequest<{ items: Topic[] }>('/topics'),
      listeningRequest<{ items: Category[] }>('/categories')
    ])
    if (run !== generation) return
    policy.value = p
    topics.value = t.items
    categories.value = c.items
  } catch (reason) {
    if (run === generation) error.value = reason instanceof Error ? reason.message : '文章读取失败'
  } finally {
    if (run === generation) busy.value = false
  }
}
/** 筛选翻页仅改变明确条件并清空当前页勾选
 * @param patch 本次变化的查询参数
 */
const filter = (patch: Record<string, string | number | undefined>) => {
  void router.push({ query: { ...route.query, ...patch } })
}
/** 当前页全选或取消，不包含其他页 */
const toggleAll = () => {
  selected.value = allSelected.value ? [] : data.value?.items.map((item) => item.id) || []
}
/** 读取当前编辑稿管理员预览，不触及用户成绩
 * @param item 用户点击的这一篇文章
 */
const showPreview = async (item: Article) => {
  const returnScroll = window.scrollY
  error.value = ''
  busy.value = true
  try {
    preview.value = (
      await listeningOperation<{ article: Article }>('POST', `/articles/${item.id}/preview`, {
        revision: item.revision
      })()
    ).article
    previewReturnScroll = returnScroll
    await nextTick()
    window.scrollTo(0, 0)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览失败'
  } finally {
    busy.value = false
  }
}
/** 关闭整页预览，恢复列表原有筛选、勾选与滚动位置 */
const closePreview = async () => {
  preview.value = null
  await nextTick()
  window.scrollTo(0, previewReturnScroll)
}
/** 固定本次删除名单，单行调用只接收这一行
 * @param items 明确选择的文章集合
 */
const confirmDelete = (items: Article[]) => {
  targets.value = JSON.parse(JSON.stringify(items))
  confirmOpen.value = true
  results.value = null
  unknownDelete.value = false
}
/** 提交明确确认的软删除集合，保留逐项失败原因 */
const remove = async () => {
  deleting.value = true
  error.value = ''
  try {
    results.value = await listeningOperation<DeleteResult>('POST', '/articles/batch-delete', {
      items: targets.value.map((item) => ({ id: item.id, revision: item.revision }))
    })()
    selected.value = []
    confirmOpen.value = false
    await load()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '删除结果未知，请查询实际状态'
    unknownDelete.value = true
    confirmOpen.value = false
  } finally {
    deleting.value = false
  }
}
/** 未知响应先查每个原目标，已删除项不再提交 */
const queryDelete = async () => {
  deleting.value = true
  error.value = ''
  const items: DeleteResult['items'] = []
  for (const target of targets.value) {
    try {
      const item = await listeningRequest<Article>(`/articles/${target.id}`)
      items.push({
        id: target.id,
        status: item.status === 'deleted' ? 'success' : 'failed',
        ...(item.status === 'deleted' ? {} : { error: '当前仍未删除，请刷新并重新确认' })
      })
    } catch (reason) {
      items.push({
        id: target.id,
        status: 'failed',
        error: reason instanceof Error ? reason.message : '结果仍未确认'
      })
    }
  }
  results.value = { items }
  unknownDelete.value = false
  selected.value = []
  deleting.value = false
  await load()
}
/** 只刷新原失败集合，版本变化后再次展示确认，不重复成功项 */
const retryFailed = async () => {
  deleting.value = true
  error.value = ''
  try {
    const ids =
      results.value?.items.filter((item) => item.status === 'failed').map((item) => item.id) || []
    const items = await Promise.all(ids.map((id) => listeningRequest<Article>(`/articles/${id}`)))
    confirmDelete(items.filter((item) => item.status !== 'deleted'))
    if (!targets.value.length) {
      confirmOpen.value = false
      notice.value = '原失败文章当前均已删除'
      await load()
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法确认最新状态，请稍后重试'
  } finally {
    deleting.value = false
  }
}
/** 明确下线当前文章，保持历史成绩及引用 */
const takeOffline = async () => {
  if (!offline.value) return
  deleting.value = true
  error.value = ''
  try {
    await listeningOperation('POST', `/articles/${offline.value.id}/offline`, {
      revision: offline.value.revision
    })()
    offline.value = null
    await load()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '下线结果未确认，请刷新'
    offline.value = null
  } finally {
    deleting.value = false
  }
}
watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/listening' || route.fullPath === previousQuery) return
    previousQuery = route.fullPath
    scrollTop = 0
    notice.value = ''
    results.value = null
    publicationResult.value = null
    selected.value = []
    search.value = String(route.query.q || '')
    void load()
  }
)
onBeforeRouteLeave(() => {
  scrollTop = preview.value ? previewReturnScroll : window.scrollY
  preview.value = null
})
onActivated(async () => {
  if (!activated) {
    activated = true
    return
  }
  const query = route.fullPath
  await load()
  await nextTick()
  if (route.path === '/listening' && route.fullPath === query) window.scrollTo(0, scrollTop)
})
onMounted(async () => {
  await load()
})
</script>
<template>
  <div class="listening-list">
    <div v-show="!preview" class="list-workspace">
      <div class="page-heading between">
        <div>
          <h1>听读文章管理</h1>
          <p>支持ZIP批量导入，也可单篇新建；按主题维护短文与完整音频。</p>
        </div>
        <div class="row">
          <RouterLink class="button-link" to="/listening-imports"
            ><AppIcon name="upload" />批量导入</RouterLink
          ><RouterLink class="button-link primary" to="/listening/new"
            ><AppIcon name="plus" />新建文章</RouterLink
          >
        </div>
      </div>
      <div class="tabs settings-actions">
        <button class="active" type="button">文章管理</button
        ><RouterLink to="/listening/categories">分类管理</RouterLink
        ><RouterLink to="/listening/topics">主题管理</RouterLink>
      </div>
      <div v-if="policy" class="between free-overview">
        <p>
          <strong>免费开放</strong> ·
          {{
            policy.configured
              ? `当前听读免费${policy.article_ids.length}篇，其余文章需学习授权`
              : '尚未设置听读免费篇数'
          }}
        </p>
        <button type="button" @click="settings = 'free'">免费开放设置</button>
      </div>
      <form class="filters" @submit.prevent="filter({ q: search || undefined, page: 1 })">
        <div class="search">
          <input v-model="search" aria-label="搜索中英文标题" placeholder="搜索中英文标题" />
          <button type="submit" aria-label="搜索" :disabled="busy">
            <AppIcon name="search" :size="16" />
          </button>
        </div>
        <label
          ><select
            aria-label="分类"
            :value="category"
            @change="
              filter({
                category_id: ($event.target as HTMLSelectElement).value || undefined,
                topic_id: undefined,
                page: 1
              })
            "
          >
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select></label
        >
        <label
          ><select
            aria-label="主题"
            :value="topic"
            @change="
              filter({ topic_id: ($event.target as HTMLSelectElement).value || undefined, page: 1 })
            "
          >
            <option value="">全部主题</option>
            <option v-for="item in filterTopics" :key="item.id" :value="item.id">
              {{ topicLabel(item) }}
            </option>
          </select></label
        ><label
          ><select
            aria-label="状态"
            :value="status"
            @change="
              filter({ status: ($event.target as HTMLSelectElement).value || undefined, page: 1 })
            "
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="offline">已下线</option>
          </select></label
        >
        <div class="filter-actions">
          <RouterLink class="button-link" to="/listening/global-order">全局免费排序</RouterLink>
        </div>
      </form>
      <AppState
        :error="error"
        :busy="busy"
        :empty="data?.total === 0"
        empty-title="暂无符合条件的文章"
        empty-text="可以新建文章，或调整筛选条件"
        @retry="load"
      />
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <div v-if="unknownDelete" class="notice error">
        本次删除结果未知，先查询实际状态<button :disabled="deleting" @click="queryDelete">
          查询本次删除结果
        </button>
      </div>
      <div
        v-if="results?.items.some((item) => item.status === 'failed')"
        class="notice result-panel"
        role="status"
      >
        <div class="between">
          <span
            >删除未完成：成功
            {{ results.items.filter((item) => item.status === 'success').length }} 篇，失败
            {{ results.items.filter((item) => item.status === 'failed').length }} 篇</span
          ><button
            v-if="results.items.some((item) => item.status === 'failed')"
            :disabled="deleting"
            @click="retryFailed"
          >
            刷新并重新确认原失败项
          </button>
        </div>
        <p
          v-for="item in results.items.filter((item) => item.status === 'failed')"
          :key="item.id"
          class="failed-detail"
        >
          {{ targets.find((target) => target.id === item.id)?.payload.title_zh || item.id }}：{{
            item.error || '失败，请刷新核对'
          }}
        </p>
      </div>
      <button v-if="pendingPublication" :disabled="deleting" @click="recoverPublication">
        查询并恢复本次发布
      </button>
      <div v-if="publicationResult" class="notice publication-results" role="alert">
        <p>以下文章未发布，请核对后重新选择发布</p>
        <p
          v-for="item in publicationResult.items.filter((row) => row.status === 'failed')"
          :key="item.id"
        >
          {{ publicationTargets.find((row) => row.id === item.id)?.payload.title_zh }}：{{
            item.message || '资料或版本已变化，请编辑核对'
          }}
        </p>
        <button :disabled="busy || deleting" @click="selectPublicationFailures">
          仅重新选择原失败项
        </button>
      </div>
      <div v-if="selected.length" class="between selection-bar">
        <span>已选当前页 {{ selected.length }} 篇</span>
        <div class="row">
          <button :disabled="deleting" @click="selected = []">取消选择</button
          ><button
            class="primary"
            :disabled="deleting || !selectedPublications.length || Boolean(pendingPublication)"
            @click="publishArticles(selectedPublications)"
          >
            批量发布（{{ selectedPublications.length }}篇）</button
          ><button
            class="danger"
            :disabled="deleting"
            @click="confirmDelete(data?.items.filter((item) => selected.includes(item.id)) || [])"
          >
            批量删除
          </button>
        </div>
      </div>
      <div v-if="data && !busy && !error && data.items.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="全选当前页文章"
                  :checked="allSelected"
                  :indeterminate="partialSelected"
                  @change="toggleAll"
                />
              </th>
              <th>文章标题</th>
              <th>分类 / 主题</th>
              <th>状态</th>
              <th>全文音频</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in data.items"
              :key="item.id"
              :class="{
                'failed-row': results?.items.some(
                  (result) => result.id === item.id && result.status === 'failed'
                )
              }"
            >
              <td>
                <input
                  v-model="selected"
                  type="checkbox"
                  :value="item.id"
                  :aria-label="`选择${item.payload.title_zh || item.id}`"
                />
              </td>
              <td>
                <strong>{{ item.payload.title_zh || '中文标题待补充' }}</strong>
                <p class="muted">{{ item.payload.title_en || '英文标题待补充' }}</p>
                <small>{{ item.payload.tags.join(' · ') }}</small>
                <p class="muted small">创建于{{ dateText(item.created_at) }}</p>
              </td>
              <td>
                {{ topicPath(item.topic_id) }}
                <p class="muted small">{{ item.word_count }} 词</p>
              </td>
              <td>
                <span class="badge" :class="item.status">{{ statusLabels[item.status] }}</span>

                <span v-if="item.status !== 'published'" class="muted small">发布后判断</span
                ><span v-else-if="!policy?.configured" class="muted small">听读尚未开放</span
                ><span v-else :class="{ badge: policy.article_ids.includes(item.id) }">{{
                  policy.article_ids.includes(item.id) ? '免费开放' : '需学习授权'
                }}</span>
              </td>
              <td>
                <span class="badge" :class="{ draft: !item.payload.audio_id }">{{
                  item.payload.audio_id ? '已关联' : '音频待补充'
                }}</span>
              </td>
              <td>
                <div class="row row-actions">
                  <RouterLink
                    :to="{ path: `/listening/${item.id}`, query: { back: route.fullPath } }"
                    >编辑</RouterLink
                  ><button class="text" @click="showPreview(item)">预览</button
                  ><button
                    v-if="item.status !== 'published' || item.has_unpublished_changes"
                    class="text"
                    :disabled="deleting || Boolean(pendingPublication)"
                    @click="publishArticles([item])"
                  >
                    发布</button
                  ><button v-if="item.status === 'published'" class="text" @click="offline = item">
                    下线</button
                  ><button class="text danger" :disabled="deleting" @click="confirmDelete([item])">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data" class="pagination">
        <span>共 {{ data.total }} 篇 · 每页10篇</span
        ><button :disabled="busy || page <= 1" @click="filter({ page: page - 1 })">上一页</button
        ><span>第 {{ page }} 页</span
        ><button :disabled="busy || page * 10 >= data.total" @click="filter({ page: page + 1 })">
          下一页
        </button>
      </div>
      <ElDialog
        :model-value="Boolean(settings)"
        :title="settings === 'free' ? '免费开放设置' : '听读管理设置'"
        :width="settings === 'free' ? '620px' : '900px'"
        destroy-on-close
        @update:model-value="settings = null"
        ><ListeningSettings v-if="settings" :initial="settings" @changed="settingsChanged"
      /></ElDialog>
    </div>
    <section v-if="preview" class="preview-workspace">
      <div class="page-heading between">
        <div>
          <h1>文章预览</h1>
          <p>核对当前编辑稿的排版与资料完整性</p>
        </div>
        <div class="row">
          <button @click="closePreview">关闭预览</button
          ><RouterLink
            class="button-link primary"
            :to="{ path: `/listening/${preview.id}`, query: { back: route.fullPath } }"
            >前往编辑并发布</RouterLink
          >
        </div>
      </div>
      <ListeningPreviewPanel
        v-if="preview"
        :article="{
          ...preview,
          topic_name: topicPath(preview?.topic_id || ''),
          category_name: categories.find(
            (item) => item.id === topics.find((item) => item.id === preview?.topic_id)?.category_id
          )?.name
        }"
      />
    </section>
    <ElDialog
      v-model="confirmOpen"
      :title="`确认删除${targets.length}篇文章`"
      width="650px"
      :close-on-click-modal="false"
      :close-on-press-escape="!deleting"
      :show-close="!deleting"
      ><p class="notice warning">
        删除后立即停止全文与资源访问；用户已有收藏、完成及打卡历史保留安全引用。删除后不能重新发布
      </p>
      <div class="confirmation-objects">
        <div v-for="item in targets" :key="item.id" class="object-card">
          <strong>{{ item.payload.title_zh || '中文标题待补充' }}</strong>
          <p class="muted small">{{ item.payload.title_en || '英文标题待补充' }}</p>
          <div class="between">
            <span class="muted small">{{ topicPath(item.topic_id) }}</span
            ><span class="badge">{{ statusLabels[item.status] }}</span>
          </div>
        </div>
      </div>
      <p class="muted small">共 {{ targets.length }} 篇。确认范围仅包含当前明确选择的文章</p>
      <template #footer
        ><button :disabled="deleting" @click="confirmOpen = false">取消</button
        ><button class="danger" :disabled="deleting || !targets.length" @click="remove">
          确认删除{{ targets.length }}篇
        </button></template
      ></ElDialog
    >
    <ElDialog
      :model-value="Boolean(offline)"
      title="确认下线文章"
      width="600px"
      @update:model-value="offline = null"
      ><div v-if="offline" class="object-card">
        <strong>{{ offline.payload.title_zh }}</strong>
        <p class="muted small">{{ offline.payload.title_en }}</p>
        <span class="muted small">{{ topicPath(offline.topic_id) }}</span>
      </div>
      <p>下线后用户暂时无法学习本篇，后台可编辑并重新发布</p>
      <p class="muted small">用户已有收藏、学习记录与打卡成绩会保留</p>
      <p class="notice warning">
        {{
          offline && policy?.article_ids.includes(offline.id) ? '本篇当前在免费名单内。' : ''
        }}下线后将依据最新发布集合重新计算全局前M篇
      </p>
      <template #footer
        ><button :disabled="deleting" @click="offline = null">取消</button
        ><button class="danger" :disabled="deleting" @click="takeOffline">
          确认下线
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.listening-list {
  .object-card {
    padding: 18px;
    margin: 16px 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);

    p {
      margin: 6px 0 12px;
    }
  }

  .confirmation-objects {
    max-height: 300px;
    overflow: auto;
  }

  .warning {
    background: #fff4d8;
    color: #826036;
    border: 1px solid #ecd6a4;
  }

  .failed-row {
    background: #fff1e8;
  }

  .failed-detail {
    margin-top: 10px;
    color: var(--danger);
  }

  .settings-actions {
    margin-bottom: 20px;
    flex-wrap: wrap;

    a {
      padding: 12px 4px;
      margin-right: 28px;
    }
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 24px 0;

    label {
      flex: 0 0 142px;
      font-size: 12px;
    }

    input,
    select {
      display: block;
      width: 100%;
      height: 40px;
      min-height: 40px;
      padding: 10px 12px;
      border-color: var(--line);
      font-size: 12px;
      line-height: 18px;
      color: var(--muted);
    }

    select {
      appearance: none;
    }
  }

  .search {
    position: relative;
    flex: 0 1 258px;
    min-width: 180px;

    input {
      padding-right: 40px;
    }

    button {
      position: absolute;
      top: 1px;
      right: 1px;
      width: 38px;
      min-height: 38px;
      padding: 0;
      border: 0;
      border-radius: 7px;
      background: transparent;
    }
  }

  .filter-actions {
    display: flex;
    gap: 10px;
    margin-left: auto;

    button,
    .button-link {
      width: 114px;
      min-height: 40px;
      padding: 0;
      border-radius: 10px;
      font-size: 13px;
    }
  }

  .free-overview {
    margin-bottom: 20px;
    padding: 14px 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #f2f6ed;
  }

  .selection-bar {
    padding: 12px 16px;
    background: var(--soft);
    margin: 18px 0;
  }

  .row-actions {
    gap: 10px;
    flex-wrap: wrap;
  }

  td {
    vertical-align: middle;
  }

  th:first-child {
    width: 42px;
  }

  .result-panel {
    margin: 18px 0;

    p {
      margin: 8px 0;
    }
  }
}
</style>

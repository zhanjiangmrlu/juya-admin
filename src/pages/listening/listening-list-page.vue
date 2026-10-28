<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { statusLabels } from '@/features/listening/listening-model'
import ListeningReader from '@/features/listening/listening-reader.vue'
import ListeningSettings from '@/features/listening/listening-settings.vue'
import { dateText, queryURL } from '@/services/display'
import { listeningOperation, listeningRequest } from '@/services/listening-service'

import type {
  Article,
  Category,
  DeleteResult,
  FreePolicy,
  Page,
  Topic
} from '@/features/listening/listening-types'

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
  activated = false
/** 展示当前文章真实分类和主题归属
 * @param topicId 文章当前主题编号
 * @returns 可识别的分类与主题路径
 */
const topicPath = (topicId: string) => {
  const value = topics.value.find((item) => item.id === topicId)
  return value
    ? `${categories.value.find((item) => item.id === value.category_id)?.name || '分类待核对'} / ${value.name}`
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
  error.value = ''
  busy.value = true
  try {
    preview.value = (
      await listeningOperation<{ article: Article }>('POST', `/articles/${item.id}/preview`, {
        revision: item.revision
      })()
    ).article
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览失败'
  } finally {
    busy.value = false
  }
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
    if (selected.value.length) notice.value = '筛选或页码已变化，当前页勾选已清空'
    selected.value = []
    search.value = String(route.query.q || '')
    void load()
  }
)
onBeforeRouteLeave(() => {
  scrollTop = window.scrollY
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
            {{ item.name }}
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
        <button type="button" @click="settings = 'free'">免费开放设置</button>
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
    <section v-if="results" class="panel result-panel">
      <h2>本次删除结果</h2>
      <p v-for="item in results.items" :key="item.id">
        {{ targets.find((target) => target.id === item.id)?.payload.title_zh || item.id }}：{{
          item.status === 'success' ? '删除成功' : `失败 · ${item.error || '请刷新核对'}`
        }}
      </p>
      <button
        v-if="results.items.some((item) => item.status === 'failed')"
        :disabled="deleting"
        @click="retryFailed"
      >
        刷新并重新确认原失败项
      </button>
    </section>
    <div v-if="selected.length" class="between selection-bar">
      <span>已选当前页 {{ selected.length }} 篇</span>
      <div class="row">
        <button :disabled="deleting" @click="selected = []">取消选择</button
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
            <th>状态 / 创建时间</th>
            <th>学习范围</th>
            <th>全文音频</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id">
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
            </td>
            <td>
              {{ topicPath(item.topic_id) }}
              <p class="muted small">{{ item.word_count }} 词</p>
            </td>
            <td>
              <span class="badge" :class="item.status">{{ statusLabels[item.status] }}</span>
              <p class="muted small">{{ dateText(item.created_at) }}</p>
            </td>
            <td>
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
                <RouterLink :to="{ path: `/listening/${item.id}`, query: { back: route.fullPath } }"
                  >编辑</RouterLink
                ><button class="text" @click="showPreview(item)">预览</button
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
    <p v-if="policy" class="notice">
      {{
        policy.configured
          ? `听读免费 M = ${policy.free_count}，当前免费 ${policy.article_ids.length} 篇；与场景免费数量独立设置`
          : '免费M尚未确认，听读暂未开放；请预览名单并明确保存'
      }}
    </p>
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
      title="听读管理设置"
      width="900px"
      destroy-on-close
      @update:model-value="settings = null"
      ><ListeningSettings v-if="settings" :initial="settings" @changed="load"
    /></ElDialog>
    <ElDialog
      :model-value="Boolean(preview)"
      class="preview-dialog"
      body-class="preview-body"
      title="文章预览"
      width="900px"
      destroy-on-close
      @update:model-value="preview = null"
      ><ListeningReader v-if="preview" :article="preview"
    /></ElDialog>
    <ElDialog
      v-model="confirmOpen"
      :title="`确认删除${targets.length}篇文章`"
      width="650px"
      :close-on-click-modal="false"
      :close-on-press-escape="!deleting"
      :show-close="!deleting"
      ><p class="notice error">
        删除后立即停止全文与资源访问；用户已有收藏、完成及打卡历史保留安全引用。删除后不能重新发布
      </p>
      <ul>
        <li v-for="item in targets" :key="item.id">
          {{ item.payload.title_zh || '中文标题待补充' }} /
          {{ item.payload.title_en || '英文标题待补充' }} · {{ statusLabels[item.status] }}
        </li>
      </ul>
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
      ><p>{{ offline?.payload.title_zh }} / {{ offline?.payload.title_en }}</p>
      <p>下线后停止学习端访问；历史记录和成绩保留</p>
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
  .preview-dialog :deep(.preview-body) {
    max-height: 72vh;
    overflow: auto;
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

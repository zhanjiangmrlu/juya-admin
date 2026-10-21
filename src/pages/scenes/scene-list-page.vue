<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import SceneBatchPublication from '@/features/scenes/scene-batch-publication.vue'
import SceneCardActions from '@/features/scenes/scene-card-actions.vue'
import SceneCatalogOrder from '@/features/scenes/scene-catalog-order.vue'
import SceneImagePreview from '@/features/scenes/scene-image-preview.vue'
import ScenePreview from '@/features/scenes/scene-preview.vue'
import SceneTitle from '@/features/scenes/scene-title.vue'
import { clientThumbnail } from '@/services/client-thumbnail'
import { dateText, mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { sceneImageId, sceneThumbnailURL } from '@/services/scene-image'

import type { CardView } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'
defineOptions({ name: 'SceneListPage' })
const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线'
}
const route = useRoute(),
  router = useRouter(),
  search = ref(String(route.query.search || ''))
const status = computed(() => String(route.query.status || 'all')),
  page = computed(() => Number(route.query.page || 1))
const focusedCard = ref('')
const thumbnailErrors = ref<Record<string, boolean>>({}),
  thumbnailRetries = ref<Record<string, number>>({}),
  generatedThumbnails = ref<Record<string, string>>({}),
  thumbnailLoading = ref<Record<string, boolean>>({})
/** 默认选择展示版本的缩略图，重试参数仅用于重新下载失败的小图
 * @param card 列表当前展示的卡片及其素材编号
 * @returns 缩略图地址或空值
 */
const thumbnailSource = (card: CardView) => {
  const id = sceneImageId(card.display_thumbnail_id, card.display_image_id),
    attempt = thumbnailRetries.value[id] || 0
  if (!id) return generatedThumbnails.value[card.display_image_id || ''] || ''
  return sceneThumbnailURL(id, attempt)
}
/** 仅标记当前缩略图失败，不影响原图查看入口
 * @param card 缩略图加载失败的卡片
 */
const failThumbnail = (card: CardView) => {
  const id = card.display_thumbnail_id || card.display_image_id
  if (id) thumbnailErrors.value[id] = true
}
/** 缺少服务端缩略图时在浏览器中生成小图，失败保留独立重试入口
 * @param card 当前列表展示版本的卡片
 * @param renew 用户重试时是否重新读取原图
 * @returns 本次缩图处理完成
 */
const loadClientThumbnail = async (card: CardView, renew = false) => {
  const id = card.display_image_id
  if (!id || card.display_thumbnail_id || thumbnailLoading.value[id]) return
  thumbnailLoading.value[id] = true
  thumbnailErrors.value[id] = false
  try {
    const result = await clientThumbnail(
      JSON.stringify([card.id, card.current_version_id || card.draft_revision, id]),
      async () => mediaURL(id),
      renew
    )
    if (alive && data.value?.items.some((item) => item.display_image_id === id))
      generatedThumbnails.value[id] = result.thumbnailSrc
  } catch {
    if (alive && data.value?.items.some((item) => item.display_image_id === id))
      thumbnailErrors.value[id] = true
  } finally {
    delete thumbnailLoading.value[id]
  }
}
/** 清除失败占位并重新请求缩略图，不打开原图
 * @param card 用户选择重试缩略图的卡片
 */
const retryThumbnail = (card: CardView) => {
  if (!card.display_thumbnail_id) {
    void loadClientThumbnail(card, true)
    return
  }
  const id = sceneImageId(card.display_thumbnail_id)
  if (!id) return
  thumbnailRetries.value[id] = (thumbnailRetries.value[id] || 0) + 1
  thumbnailErrors.value[id] = false
}
let listingGeneration = 0
const { data, busy, error, refresh } = useResource(async () => {
  const run = ++listingGeneration,
    requested = route.fullPath
  const value = await api.request<components['schemas']['AdminCardPage']>(
    queryURL('/api/admin/v1/cards', {
      search: route.query.search || '',
      status: status.value,
      page: page.value,
      batch_id: route.query.batch_id,
      anchor_id: route.query.focus,
      limit: 10
    })
  )
  if (run !== listingGeneration || requested !== route.fullPath || route.path !== '/cards')
    return value
  if (route.query.focus) focusedCard.value = String(route.query.focus)
  if (value.page !== page.value || route.query.focus)
    await router.replace({ query: { ...route.query, page: value.page, focus: undefined } })
  return value
})
watch(
  () => data.value?.items,
  (items) => {
    // KeepAlive 页面只持有当前页小图，跨页复用及过期交给有容量上限的公共缓存
    const originalIds = new Set((items || []).map((card) => card.display_image_id)),
      thumbnailIds = new Set((items || []).map((card) => card.display_thumbnail_id)),
      visibleIds = new Set([...originalIds, ...thumbnailIds])
    for (const id of Object.keys(generatedThumbnails.value))
      if (!originalIds.has(id)) delete generatedThumbnails.value[id]
    for (const id of Object.keys(thumbnailErrors.value))
      if (!visibleIds.has(id)) delete thumbnailErrors.value[id]
    for (const id of Object.keys(thumbnailRetries.value))
      if (!thumbnailIds.has(id)) delete thumbnailRetries.value[id]
    for (const card of items || []) {
      const id = card.display_image_id
      if (
        id &&
        !card.display_thumbnail_id &&
        !generatedThumbnails.value[id] &&
        !thumbnailErrors.value[id]
      )
        void loadClientThumbnail(card)
    }
  }
)
const image = ref<CardView | null>(null),
  actionOpen = ref(false),
  actionKind = ref<'offline' | 'delete'>('offline'),
  actionIds = ref<string[]>([]),
  actionBatch = ref(''),
  managementBatches = ref<components['schemas']['ActionBatchView'][]>([])
const preview = ref<components['schemas']['PublishedPreview'] | null>(null),
  actionError = ref(''),
  actionBusy = ref(false),
  sorting = ref(false),
  selected = ref<string[]>([]),
  batchOpen = ref(false),
  selectedBatch = ref(''),
  batches = ref<components['schemas']['BatchView'][]>([]),
  historyError = ref('')
const confirmation = ref<{ card: CardView; kind: 'offline' | 'delete' } | null>(null)
let pending: (() => Promise<unknown>) | null = null
let alive = true,
  historyTimer: ReturnType<typeof setTimeout> | null = null,
  historyChecks = 0
let managementTimer: ReturnType<typeof setTimeout> | null = null,
  managementGeneration = 0,
  managementChecks = 0
const canSort = computed(
  () => status.value === 'published' && !route.query.search && !route.query.batch_id
)
/** 进入全局排序前清空普通列表选择 */
const enterSorting = () => {
  clearSelection()
  sorting.value = true
}
/** 版本失效时关闭原图并刷新当前列表 */
const imageInvalid = () => {
  image.value = null
  void refresh()
  ElMessage.info('卡片资料已变化，请重新查看')
}
/** 接收管理批次结果后刷新同一查询上下文 */
const actionChanged = () => {
  selected.value = []
  void refresh()
  void loadManagement()
}
/** 关闭确认保留原选择，关闭结果后可从最近操作恢复 */
const closeActions = () => {
  actionOpen.value = false
  void loadManagement()
}
const hasPendingAction = ref(!!sessionStorage.getItem('juya-pending-card-actions'))
/** 清空当前页选择并给出可见反馈 */
const clearSelection = () => {
  if (selected.value.length) {
    selected.value = []
    ElMessage.info('选择已清空')
  }
}
/** 离开列表时停止管理结果跟踪并忽略迟到响应 */
const stopManagement = () => {
  managementGeneration++
  if (managementTimer) clearTimeout(managementTimer)
  managementTimer = null
}
/** 跟踪同一管理员的未完成操作，关闭弹窗后仍按真实结果刷新列表
 * @param automatic 是否由后台查询触发，保留逐步放慢的查询间隔
 */
const loadManagement = async (automatic = false) => {
  if (!alive || route.path !== '/cards') return
  stopManagement()
  const run = managementGeneration
  if (!automatic) managementChecks = 0
  hasPendingAction.value = !!sessionStorage.getItem('juya-pending-card-actions')
  try {
    const value = await api.request<components['schemas']['ActionBatchView'][]>(
      '/api/admin/v1/card-action-batches'
    )
    if (!alive || run !== managementGeneration || route.path !== '/cards') return
    const changed = JSON.stringify(value) !== JSON.stringify(managementBatches.value)
    managementBatches.value = value
    if (changed) void refresh()
  } catch {
    if (!alive || run !== managementGeneration || route.path !== '/cards') return
    actionError.value = '最近管理操作暂未获取，请刷新重试'
  }
  if (
    managementBatches.value.some((batch) =>
      batch.items.some((item) => ['queued', 'running', 'retry'].includes(item.state))
    )
  ) {
    const delay = Math.min(1500 * 2 ** Math.floor(managementChecks++ / 5), 10000)
    managementTimer = setTimeout(() => {
      void loadManagement(true)
    }, delay)
  }
}
/** 打开冻结范围的管理确认或已有结果
 * @param kind 下线或删除动作
 * @param id 已接受批次，空值表示当前页选择
 */
const openActions = (kind: 'offline' | 'delete', id = '') => {
  actionKind.value = kind
  actionIds.value = [...selected.value]
  actionBatch.value = id
  actionOpen.value = true
}
watch(data, (value) => {
  if (value)
    selected.value = selected.value.filter((id) => value.items.some((card) => card.id === id))
})
watch(
  data,
  () => {
    if (focusedCard.value) {
      document
        .querySelector(`[data-card-id="${CSS.escape(focusedCard.value)}"]`)
        ?.scrollIntoView?.({ block: 'center' })
      focusedCard.value = ''
    }
  },
  { flush: 'post' }
)
let listContext = JSON.stringify([
  route.query.search,
  route.query.status,
  route.query.page,
  route.query.batch_id
])
watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/cards') return
    const next = JSON.stringify([
      route.query.search,
      route.query.status,
      route.query.page,
      route.query.batch_id
    ])
    if (next !== listContext) clearSelection()
    listContext = next
  }
)
const allSelected = computed(
  () =>
    !!data.value?.items.length && data.value.items.every((card) => selected.value.includes(card.id))
)
/** 选择当前页可见卡片
 * @param id 当前卡片编号
 * @param event 管理员的勾选动作
 */
const selectCard = (id: string, event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.checked && !selected.value.includes(id)) {
    if (selected.value.length >= 50) {
      input.checked = false
      actionError.value = '一次最多选择50张，请先取消部分选择'
      return
    }
    selected.value = [...selected.value, id]
  } else if (!input.checked) selected.value = selected.value.filter((value) => value !== id)
}
/** 本页全选只作用于当前显示集合
 * @param event 本页全选复选框变化
 */
const selectPage = (event: Event) => {
  const input = event.target as HTMLInputElement,
    ids = data.value?.items.map((card) => card.id) || []
  const next = input.checked
    ? [...new Set([...selected.value, ...ids])]
    : selected.value.filter((id) => !ids.includes(id))
  if (next.length > 50) {
    input.checked = false
    actionError.value = '一次最多选择50张，请先取消部分选择'
    return
  }
  selected.value = next
}
/** 简短显示持久化的真实逐卡结果
 * @param batch 最近一次批量发布
 * @returns 成功、失败与处理中的实际数量
 */
const batchSummary = (batch: components['schemas']['BatchView']) =>
  `成功 ${batch.items.filter((item) => item.state === 'succeeded').length} · 失败 ${batch.items.filter((item) => item.state === 'failed').length} · 处理中 ${batch.items.filter((item) => !['succeeded', 'failed'].includes(item.state)).length}`
/** 只为当前可见页面做有限后台刷新
 * @param automatic 是否由上次刷新定时触发
 */
const loadBatches = async (automatic = false) => {
  if (historyTimer) {
    clearTimeout(historyTimer)
    historyTimer = null
  }
  if (!automatic) historyChecks = 0
  try {
    const value = await api.request<components['schemas']['BatchView'][]>(
      '/api/admin/v1/publication-batches'
    )
    if (!alive || route.path !== '/cards') return
    batches.value = value
    historyError.value = ''
    if (
      value.some((batch) =>
        batch.items.some((item) => !['succeeded', 'failed'].includes(item.state))
      ) &&
      historyChecks < 12
    ) {
      historyChecks++
      historyTimer = setTimeout(() => {
        void loadBatches(true)
      }, 5000)
    }
  } catch (reason) {
    if (alive) historyError.value = reason instanceof Error ? reason.message : '发布记录暂未获取'
  }
}
/** 关闭发布层后，保留服务器记录并刷新原列表
 * @param batchId 已接受的批次，取消预览时为空
 */
const closeBatch = (batchId: string | null) => {
  batchOpen.value = false
  selectedBatch.value = ''
  if (batchId) selected.value = []
  void refresh()
  void loadBatches()
}
/** 打开已选集合或已有发布结果
 * @param batchId 有值时只读取该次持久结果
 */
const openBatch = (batchId = '') => {
  selectedBatch.value = batchId
  batchOpen.value = true
}
/** 退出原页排序模式并刷新当前筛选 */
const closeSorting = () => {
  sorting.value = false
  void refresh()
}
/** 切换列表条件，清理跨条件选择
 * @returns 路由条件更新
 * @param values 需要覆盖的筛选值
 */
const filter = (values: Record<string, string | number | undefined>) => {
  clearSelection()
  return router.replace({ query: { ...route.query, ...values, page: values.page || 1 } })
}
/** 打开当前发布快照
 * @param card 稳定卡片
 */
const showPublished = async (card: CardView) => {
  actionError.value = ''
  try {
    preview.value = await api.request(`/api/admin/v1/cards/${card.id}/published`)
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '预览失败'
  }
}
/** 准备带具体影响的下线或删除确认
 * @param card 选中的卡片
 * @param kind 业务动作
 */
const ask = (card: CardView, kind: 'offline' | 'delete') => {
  confirmation.value = { card, kind }
  actionError.value = ''
  pending = api.operation(
    kind === 'delete' ? 'DELETE' : 'POST',
    `/api/admin/v1/cards/${card.id}${kind === 'offline' ? '/offline' : ''}`,
    { revision: card.draft_revision }
  )
}
/** 只在真实成功后更新列表，未知结果保留原操作键 */
const confirm = async () => {
  if (!pending || actionBusy.value) return
  actionBusy.value = true
  actionError.value = ''
  try {
    await pending()
    confirmation.value = null
    await refresh()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '操作失败，请重试'
  } finally {
    actionBusy.value = false
  }
}
watch(
  () => route.fullPath,
  () => {
    if (route.path === '/cards') {
      search.value = String(route.query.search || '')
      void refresh()
    }
  }
)
let listPosition: { path: string; left: number; top: number } | null = null
onBeforeRouteLeave(() => {
  listPosition = { path: route.fullPath, left: window.scrollX, top: window.scrollY }
})
onActivated(async () => {
  const position = listPosition
  void loadBatches()
  void loadManagement()
  await refresh()
  await nextTick()
  if (position?.path === route.fullPath && route.path === '/cards')
    window.scrollTo(position.left, position.top)
})
onDeactivated(() => {
  preview.value = null
  image.value = null
  batchOpen.value = false
  actionOpen.value = false
  if (historyTimer) clearTimeout(historyTimer)
  stopManagement()
})
onBeforeUnmount(() => {
  alive = false
  if (historyTimer) clearTimeout(historyTimer)
  stopManagement()
})
</script>
<template>
  <div class="card-list-page">
    <div v-if="!sorting" class="page-heading between">
      <div>
        <RouterLink v-if="route.query.from === 'statistics'" to="/statistics" class="back-link"
          >‹ 返回数据统计</RouterLink
        >
        <h1>卡片管理</h1>
        <p>双语标题与当前发布状态同步至用户端。</p>
      </div>
      <div class="row">
        <button
          v-if="!sorting"
          type="button"
          :disabled="!canSort"
          :title="canSort ? '调整全局已发布顺序' : '请筛选已发布并清除名称和本次导入条件'"
          @click="enterSorting"
        >
          调整顺序</button
        ><RouterLink class="button-link" to="/imports">批量导入</RouterLink
        ><RouterLink class="button-link primary" to="/cards/new"
          ><AppIcon name="plus" />新建卡片</RouterLink
        >
      </div>
    </div>
    <SceneCatalogOrder v-if="sorting" @close="closeSorting" />
    <div v-else class="card-list-content">
      <p v-if="route.query.batch_id" class="notice between">
        <span>本次导入 · 只显示本批已保存的卡片</span
        ><button type="button" class="text" @click="filter({ batch_id: undefined })">
          清除本次导入筛选
        </button>
      </p>
      <form class="filters card-filters" @submit.prevent="filter({ search })">
        <input
          v-model="search"
          type="search"
          aria-label="搜索中文或英文标题"
          placeholder="搜索中文或英文标题"
        />
        <button type="submit" class="search-submit">搜索</button>
        <div class="segments" aria-label="发布状态">
          <button
            v-for="item in [
              { value: 'all', label: '全部' },
              { value: 'published', label: '已发布' },
              { value: 'draft', label: '草稿' },
              { value: 'offline', label: '已下线' }
            ]"
            :key="item.value"
            type="button"
            :aria-pressed="status === item.value"
            @click="filter({ status: item.value })"
          >
            {{ item.label }}
          </button>
        </div>
      </form>
      <div v-if="data?.items.length" class="selection-bar">
        <label class="page-selection"
          ><input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="selected.length > 0 && !allSelected"
            aria-label="选择本页卡片"
            @change="selectPage"
          />选择本页</label
        >
        <span>已选择 {{ selected.length }} 张</span>
        <div class="row">
          <button type="button" class="small" :disabled="!selected.length" @click="openBatch()">
            批量发布
          </button>
          <button
            type="button"
            class="small"
            :disabled="!selected.length"
            @click="openActions('offline')"
          >
            批量下线
          </button>
          <button
            type="button"
            class="small"
            :disabled="!selected.length"
            @click="openActions('delete')"
          >
            批量删除
          </button>
          <button v-if="selected.length" type="button" class="text small" @click="selected = []">
            取消选择
          </button>
        </div>
        <small>仅本页选择，不跨页累计</small>
      </div>
      <p v-if="actionError && !confirmation" class="notice error" role="alert">{{ actionError }}</p>
      <AppState
        :busy="busy"
        :error="error"
        :empty="data?.total === 0"
        empty-title="暂无场景卡片"
        empty-text="可以新建卡片，保存资料后预览并发布"
        @retry="refresh"
      />
      <div v-if="data && data.total && !busy && !error" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="select-cell">选</th>
              <th>场景卡片</th>
              <th>状态</th>
              <th>最近修改</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in data.items" :key="card.id" :data-card-id="card.id">
              <td class="select-cell">
                <input
                  type="checkbox"
                  :checked="selected.includes(card.id)"
                  :aria-label="`选择 ${card.display_name || card.content.name}`"
                  @change="selectCard(card.id, $event)"
                />
              </td>
              <td>
                <div class="row">
                  <button
                    v-if="card.display_image_id"
                    type="button"
                    class="thumbnail-button"
                    :aria-label="`查看 ${card.display_name} 场景大图`"
                    @click.stop="image = card"
                  >
                    <img
                      v-if="
                        thumbnailSource(card) &&
                        !thumbnailErrors[card.display_thumbnail_id || card.display_image_id || '']
                      "
                      :src="thumbnailSource(card)"
                      class="thumbnail"
                      alt=""
                      loading="lazy"
                      @error="failThumbnail(card)"
                    /><span v-else class="thumbnail-placeholder">{{
                      thumbnailErrors[card.display_thumbnail_id || card.display_image_id || '']
                        ? '缩略图加载失败'
                        : '正在生成缩略图…'
                    }}</span></button
                  ><button
                    v-if="thumbnailErrors[card.display_thumbnail_id || card.display_image_id || '']"
                    type="button"
                    class="text small thumbnail-retry"
                    :aria-label="`重试 ${card.display_name} 缩略图`"
                    @click.stop="retryThumbnail(card)"
                  >
                    重试</button
                  ><span v-if="!card.display_image_id" class="small muted">暂无场景图</span>
                  <div class="card-title-cell">
                    <SceneTitle
                      class="name"
                      :name="card.display_name"
                      :title-en="card.display_title_en"
                    />
                    <p
                      v-if="card.status !== 'published' || !card.has_unpublished_changes"
                      class="small muted"
                    >
                      {{ card.content.vocabulary?.length || 0 }} 个词汇 ·
                      {{ card.content.chunks?.length || 0 }} 个语块
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge" :class="card.status">{{
                  statusLabels[card.status] || card.status
                }}</span>
                <p
                  v-if="card.status === 'published' && card.has_unpublished_changes"
                  class="badge draft"
                >
                  有未发布修改
                </p>
                <p v-if="card.issues.length && card.status !== 'published'" class="small muted">
                  待补充 {{ card.issues.length }} 项
                </p>
              </td>
              <td>
                <time class="card-modified"
                  ><span>{{ dateText(card.updated_at).split(' ')[0] }}</span
                  ><span>{{ dateText(card.updated_at).split(' ')[1] }}</span></time
                >
              </td>
              <td>
                <RouterLink :to="{ path: `/cards/${card.id}`, query: { back: route.fullPath } }"
                  >编辑</RouterLink
                ><button
                  v-if="card.status === 'published'"
                  type="button"
                  class="text small"
                  @click="showPublished(card)"
                >
                  查看效果</button
                ><button
                  v-if="card.status === 'published'"
                  type="button"
                  class="text small"
                  @click="ask(card, 'offline')"
                >
                  下线</button
                ><button type="button" class="text danger small" @click="ask(card, 'delete')">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data && !error" class="pagination">
        <span class="pagination-total">共 {{ data.total }} 张 · 每页10条</span
        ><button :disabled="page <= 1 || busy" @click="filter({ page: page - 1 })">上一页</button
        ><span v-if="data.total">第 {{ data.page }} / {{ data.total_pages }} 页</span
        ><span v-else>暂无卡片</span
        ><button :disabled="page >= data.total_pages || busy" @click="filter({ page: page + 1 })">
          下一页
        </button>
      </div>
      <div v-if="managementBatches.length || hasPendingAction" class="batch-history">
        <button v-if="hasPendingAction" type="button" @click="openActions('delete')">
          查询待确认管理操作
        </button>
        <details v-if="managementBatches.length">
          <summary>最近批量管理操作</summary>
          <div v-for="value in managementBatches" :key="value.id" class="between">
            <span
              >{{ dateText(value.created_at) }} · 批量{{
                value.action === 'delete' ? '删除' : '下线'
              }}
              · {{ value.items.length }}张</span
            ><button @click="openActions(value.action, value.id)">查看结果</button>
          </div>
        </details>
      </div>
      <details v-if="batches.length" class="batch-history">
        <summary>最近批量发布</summary>
        <div v-for="batch in batches" :key="batch.id" class="between">
          <span class="small">{{ dateText(batch.created_at) }} · {{ batchSummary(batch) }}</span
          ><button type="button" class="text small" @click="openBatch(batch.id)">查看结果</button>
        </div>
      </details>
      <p v-if="historyError" class="notice error">
        发布记录暂未获取<button type="button" class="text" @click="loadBatches()">重新获取</button>
      </p>
    </div>
    <SceneImagePreview v-if="image" :card="image" @close="image = null" @invalid="imageInvalid" />
    <SceneCardActions
      v-if="actionOpen"
      :action="actionKind"
      :card-ids="actionIds"
      :batch-id="actionBatch || undefined"
      @close="closeActions"
      @changed="actionChanged"
    />
    <SceneBatchPublication
      v-if="batchOpen"
      :card-ids="selected"
      :batch-id="selectedBatch || undefined"
      @close="closeBatch"
    />
    <ScenePreview
      v-if="preview"
      :content="preview.content"
      :pronunciation="{ cardId: preview.card_id, reference: { version_id: preview.version_id } }"
      mode="published"
      @close="preview = null"
    /><ElDialog
      :model-value="!!confirmation"
      :title="confirmation?.kind === 'delete' ? '删除这张卡片？' : '下线这张卡片？'"
      width="560px"
      :close-on-click-modal="false"
      :show-close="!actionBusy"
      @close="confirmation = null"
      ><template v-if="confirmation"
        ><h3>
          <SceneTitle
            :name="confirmation.card.display_name"
            :title-en="confirmation.card.display_title_en"
          />
        </h3>
        <p class="impact">
          {{
            confirmation.kind === 'delete'
              ? '卡片将移出后台主列表，用户不能继续学习，不提供恢复入口。已有完成和打卡成绩会保留。'
              : '卡片将停止前端学习，之后可以重新发布。已有学习记录和打卡成绩会保留。'
          }}
        </p>
        <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p></template
      ><template #footer
        ><button :disabled="actionBusy" @click="confirmation = null">取消</button>
        <button class="primary" :disabled="actionBusy" @click="confirm">
          {{ actionBusy ? '正在处理…' : confirmation?.kind === 'delete' ? '确认删除' : '确认下线' }}
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.card-filters {
  margin-bottom: 20px;
  gap: 0;

  input {
    max-width: 380px;
  }

  .segments {
    margin-left: auto;
  }

  .search-submit {
    position: absolute;
    width: 1px;
    height: 1px;
    min-height: 0;
    overflow: hidden;
    clip-path: inset(50%);
    padding: 0;
    border: 0;
  }
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  margin-bottom: 18px;
  border-radius: 10px;
  min-height: 58px;
  background: var(--soft);

  .page-selection {
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
  }

  .row {
    gap: 20px;
  }

  small {
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
  }
}

:where(.card-list-content) {
  .table-wrap {
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
  }

  table {
    table-layout: fixed;
  }

  th:first-child {
    width: 4%;
  }

  th:nth-child(2) {
    width: 34%;
  }

  th:nth-child(3) {
    width: 20%;
  }

  th:nth-child(4) {
    width: 16%;
  }

  th:last-child {
    width: 26%;
  }

  th {
    height: 54px;
    padding-top: 14px;
    padding-bottom: 14px;
  }

  tbody tr {
    height: 123px;
  }

  td .badge + .badge {
    margin-left: 5px;
  }

  td:last-child {
    font-size: 13px;
  }

  td .text {
    padding: 6px 7px;
    font-size: 13px;
  }

  .pagination {
    border: 1px solid var(--line);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background: var(--paper);
  }

  .pagination-total {
    margin-right: auto;
  }
}

.card-title-cell {
  min-width: 0;

  .name {
    min-width: 0;
  }
}

.thumbnail-button {
  width: 78px;
  height: 82px;
  padding: 8px 14px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--paper);

  .thumbnail {
    width: 48px;
    height: 64px;
    object-fit: contain;
    border-radius: 6px;
  }
}

.card-modified {
  display: grid;
  gap: 2px;
}

.select-cell {
  text-align: center;
}

.batch-history {
  margin-top: 16px;
  color: var(--muted);
  font-size: 12px;

  summary {
    cursor: pointer;
  }

  > div {
    padding-top: 10px;
  }
}

.back-link {
  display: block;
  margin-bottom: 12px;
}

.impact {
  margin: 16px 0;
  color: var(--muted);
}

@media (width <= 1200px) {
  .selection-bar {
    flex-wrap: wrap;
    gap: 12px;

    .row {
      gap: 8px;
    }
  }
}
</style>

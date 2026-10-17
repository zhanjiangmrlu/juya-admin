<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import SceneBatchPublication from '@/features/scenes/scene-batch-publication.vue'
import SceneCatalogOrder from '@/features/scenes/scene-catalog-order.vue'
import ScenePreview from '@/features/scenes/scene-preview.vue'
import { dateText, mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'

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
const { data, busy, error, refresh } = useResource(() =>
  api.request<components['schemas']['Page_CardView_']>(
    queryURL('/api/admin/v1/cards', {
      search: route.query.search || '',
      status: status.value,
      page: page.value,
      batch_id: route.query.batch_id,
      limit: route.query.batch_id ? 50 : 20
    })
  )
)
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
const allSelected = computed(
  () =>
    !!data.value?.items.length && data.value.items.every((card) => selected.value.includes(card.id))
)
/** 选择明确卡片，跨页累计最多五十张
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
  if (!Object.hasOwn(values, 'page')) selected.value = []
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
onActivated(() => {
  void refresh()
  void loadBatches()
})
onDeactivated(() => {
  if (historyTimer) clearTimeout(historyTimer)
})
onBeforeUnmount(() => {
  alive = false
  if (historyTimer) clearTimeout(historyTimer)
})
</script>
<template>
  <div>
    <div class="page-heading between">
      <div>
        <RouterLink v-if="route.query.from === 'statistics'" to="/statistics" class="back-link"
          >‹ 返回数据统计</RouterLink
        >
        <h1>卡片管理</h1>
        <p>管理场景资料，确认预览后发布到学习端</p>
      </div>
      <div class="row">
        <RouterLink class="button-link" to="/imports"
          ><AppIcon name="upload" :size="17" />批量导入</RouterLink
        >
        <button v-if="!sorting" type="button" @click="sorting = true">调整顺序</button
        ><RouterLink class="button-link primary" to="/cards/new"
          ><AppIcon name="cards" :size="17" />新建卡片</RouterLink
        >
      </div>
    </div>
    <SceneCatalogOrder v-if="sorting" @close="closeSorting" />
    <div v-else class="panel">
      <p v-if="route.query.batch_id" class="notice between">
        <span>本次导入 · 只显示本批已保存的卡片</span
        ><button type="button" class="text" @click="filter({ batch_id: undefined })">
          清除本次导入筛选
        </button>
      </p>
      <div v-if="selected.length" class="selection-bar between">
        <span>已选 {{ selected.length }} 张（最多50张，可跨页选择）</span>
        <div class="row">
          <button type="button" class="text" @click="selected = []">清空选择</button
          ><button type="button" class="primary" @click="openBatch()">批量发布</button>
        </div>
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
      <form class="filters" @submit.prevent="filter({ search })">
        <input v-model="search" aria-label="搜索卡片名称" placeholder="搜索卡片名称" /><button
          type="submit"
        >
          <AppIcon name="search" :size="16" />搜索</button
        ><select
          :value="status"
          aria-label="发布状态"
          @change="filter({ status: ($event.target as HTMLSelectElement).value })"
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
          <option value="offline">已下线</option></select
        ><button type="button" class="text" :disabled="busy" @click="refresh">刷新</button>
      </form>
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
              <th class="select-cell">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  aria-label="选择本页卡片"
                  @change="selectPage"
                />
              </th>
              <th>场景卡片</th>
              <th>状态</th>
              <th>资料</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in data.items" :key="card.id">
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
                  <img
                    v-if="card.display_thumbnail_id"
                    :src="mediaURL(card.display_thumbnail_id)"
                    class="thumbnail"
                    alt=""
                  />
                  <div>
                    <span class="name">{{ card.display_name || '未命名草稿' }}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge" :class="card.status">{{
                  statusLabels[card.status] || card.status
                }}</span>
                <p
                  v-if="card.status === 'published' && card.has_unpublished_changes"
                  class="small muted"
                >
                  有未发布修改
                </p>
              </td>
              <td>
                <span v-if="card.issues.length" class="small muted"
                  >待补充 {{ card.issues.length }} 项</span
                ><span v-else class="small">资料完整</span>
              </td>
              <td>{{ dateText(card.updated_at) }}</td>
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
      <div v-if="data && data.total > 20" class="pagination">
        <span>共 {{ data.total }} 张</span
        ><button :disabled="page <= 1 || busy" @click="filter({ page: page - 1 })">上一页</button
        ><span>第 {{ page }} 页</span
        ><button :disabled="page * 20 >= data.total || busy" @click="filter({ page: page + 1 })">
          下一页
        </button>
      </div>
    </div>
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
      width="460px"
      :close-on-click-modal="false"
      :show-close="!actionBusy"
      @close="confirmation = null"
      ><template v-if="confirmation"
        ><h3>{{ confirmation.card.display_name || '未命名草稿' }}</h3>
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
.selection-bar {
  padding: 0 0 18px;
  font-size: 13px;
}

.batch-history {
  margin-bottom: 20px;
  padding: 12px;
  background: var(--soft);
  border-radius: 8px;

  summary {
    cursor: pointer;
    font-size: 13px;
  }

  > div {
    padding-top: 10px;
  }
}

.select-cell {
  width: 40px;
  text-align: center;
}

.button-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  text-decoration: none;
  background: var(--green);
  color: #fff;
  font-weight: 600;
}

.thumbnail {
  width: 48px;
  height: 64px;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: 5px;
}

.back-link {
  display: block;
  font-size: 12px;
  margin-bottom: 12px;
}

.impact {
  margin: 16px 0;
  color: var(--muted);
}
</style>

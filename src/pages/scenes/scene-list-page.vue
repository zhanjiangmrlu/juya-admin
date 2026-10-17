<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
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
      limit: 20
    })
  )
)
const preview = ref<components['schemas']['PublishedPreview'] | null>(null),
  actionError = ref(''),
  actionBusy = ref(false)
const confirmation = ref<{ card: CardView; kind: 'offline' | 'delete' } | null>(null)
let pending: (() => Promise<unknown>) | null = null
/** 切换列表条件，清理跨条件选择
 * @returns 路由条件更新
 * @param values 需要覆盖的筛选值
 */
const filter = (values: Record<string, string | number>) =>
  router.replace({ query: { ...route.query, ...values, page: values.page || 1 } })
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
      <RouterLink class="button-link primary" to="/cards/new"
        ><AppIcon name="cards" :size="17" />新建卡片</RouterLink
      >
    </div>
    <div class="panel">
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
              <th>场景卡片</th>
              <th>状态</th>
              <th>资料</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in data.items" :key="card.id">
              <td>
                <div class="row">
                  <img
                    v-if="card.display_thumbnail_id"
                    :src="mediaURL(card.display_thumbnail_id)"
                    class="thumbnail"
                    alt=""
                  />
                  <div>
                    <span class="name">{{ card.display_name || '未命名草稿' }}</span
                    ><span class="identifier">{{ card.id }}</span>
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
    <ScenePreview
      v-if="preview"
      :content="preview.content"
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

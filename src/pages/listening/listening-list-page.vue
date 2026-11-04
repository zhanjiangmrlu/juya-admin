<script setup lang="ts">
import {
  ElButton,
  ElCheckbox,
  ElConfigProvider,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { computed, nextTick, onActivated, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import listeningSearchIcon from '@/assets/icons/listening-search.svg'
import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import FreeAccessControl from '@/features/learning-access/free-access-control.vue'
import { statusLabels } from '@/features/listening/listening-model'
import ListeningPreviewPanel from '@/features/listening/listening-preview-panel.vue'
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
  Page
} from '@/features/listening/listening-types'
import type { components } from '@/shared/contracts/generated/admin-api'
import type { TabPaneName } from 'element-plus'

defineOptions({ name: 'ListeningListPage' })
const route = useRoute(),
  router = useRouter()
const data = ref<Page<Article> | null>(null),
  categories = ref<Category[]>([]),
  policy = ref<FreePolicy | null>(null),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  selected = ref<string[]>([]),
  search = ref(String(route.query.q || '')),
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
/** 免费保存后保留当前筛选、分页、勾选和位置，刷新真实全量汇总 */
const freeChanged = async () => {
  const top = window.scrollY
  await load()
  await nextTick()
  await nextTick()
  window.scrollTo(0, top)
}
const page = computed(() => Math.max(1, Number(route.query.page) || 1)),
  category = computed(() => String(route.query.category_id || '')),
  status = computed(() => String(route.query.status || '')),
  allSelected = computed(() =>
    Boolean(data.value?.items.length && selected.value.length === data.value.items.length)
  ),
  partialSelected = computed(() => selected.value.length > 0 && !allSelected.value)
let generation = 0
let previousQuery = route.fullPath,
  scrollTop = 0,
  previewReturnScroll = 0,
  activated = false
/** 展示编辑稿当前分类，不借历史主题推算归属
 * @param categoryId 文章直接分类编号
 * @returns 当前有效分类名称
 */
const categoryName = (categoryId: string) =>
  categories.value.find((item) => item.id === categoryId)?.name || '分类待核对'
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
    const [p, c] = await Promise.all([
      listeningRequest<FreePolicy>('/free-policy'),
      listeningRequest<{ items: Category[] }>('/categories')
    ])
    if (run !== generation) return
    policy.value = p
    categories.value = c.items
  } catch (reason) {
    if (run === generation) error.value = reason instanceof Error ? reason.message : '文章读取失败'
  } finally {
    if (run === generation) busy.value = false
  }
}
/** 路由负责切换管理页面，阻止缓存列表记住分类 Tab 的内部选中状态
 * @param name 用户点击的管理页签名称
 * @returns 始终拒绝组件内部切换，由目标路由显示对应页签
 */
const navigateTab = (name: TabPaneName) => {
  if (name === 'categories') void router.push('/listening/categories')
  return false
}
/** 筛选翻页仅改变明确条件并清空当前页勾选
 * @param patch 本次变化的查询参数
 */
const filter = (patch: Record<string, string | number | undefined>) => {
  void router.push({ query: { ...route.query, ...patch } })
}
/** 标记本次删除失败的文章行
 * @param context 表格行信息
 * @param context.row 表格当前行对应的文章
 * @returns 删除失败行的样式名
 */
const articleRowClass = ({ row }: { row: Article }) =>
  results.value?.items.some((result) => result.id === row.id && result.status === 'failed')
    ? 'failed-row'
    : ''
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
  // 等待表格列注册和表体更新完成后再恢复列表滚动
  await nextTick()
  if (route.path === '/listening' && route.fullPath === query) window.scrollTo(0, scrollTop)
})
onMounted(async () => {
  await load()
})
</script>
<template>
  <div class="listening-list">
    <div v-show="!preview" class="list-workspace content-list">
      <ElConfigProvider :locale="zhCn">
        <div class="page-heading between">
          <div>
            <h1>听读文章管理</h1>
            <p>支持ZIP批量导入，也可单篇新建；按分类维护短文与完整音频。</p>
          </div>
          <div class="row">
            <RouterLink class="button-link" to="/listening-imports"
              ><AppIcon name="upload" />批量导入</RouterLink
            ><RouterLink class="button-link primary" to="/listening/new"
              ><AppIcon name="plus" />新建文章</RouterLink
            >
          </div>
        </div>
        <ElTabs model-value="articles" :before-leave="navigateTab"
          ><ElTabPane label="文章管理" name="articles" /><ElTabPane
            label="分类管理"
            name="categories"
        /></ElTabs>
        <div v-if="policy" class="between free-overview">
          <p>
            <strong>免费开放</strong
            ><span
              >当前免费听读 <b>{{ policy.article_ids.length }}</b> 篇</span
            >
          </p>
          <small>在每条内容的操作区启用或关闭</small>
        </div>
        <form class="filters" @submit.prevent="filter({ q: search || undefined, page: 1 })">
          <div class="search">
            <ElInput v-model="search" aria-label="搜索中英文标题" placeholder="搜索中英文标题" />
            <ElButton native-type="submit" aria-label="搜索" :disabled="busy">
              <img :src="listeningSearchIcon" width="16" height="16" alt="" aria-hidden="true" />
            </ElButton>
          </div>
          <ElSelect
            :model-value="category"
            aria-label="分类"
            placeholder="全部分类"
            :empty-values="[null, undefined]"
            @change="filter({ category_id: $event || undefined, page: 1 })"
            ><ElOption label="全部分类" value="" /><ElOption
              v-for="item in categories"
              :key="item.id"
              :label="item.name"
              :value="item.id"
          /></ElSelect>
          <ElSelect
            :model-value="status"
            aria-label="状态"
            placeholder="全部状态"
            :empty-values="[null, undefined]"
            @change="filter({ status: $event || undefined, page: 1 })"
            ><ElOption label="全部状态" value="" /><ElOption label="草稿" value="draft" /><ElOption
              label="已发布"
              value="published" /><ElOption label="已下线" value="offline"
          /></ElSelect>
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
          本次删除结果未知，先查询实际状态<ElButton :disabled="deleting" @click="queryDelete">
            查询本次删除结果
          </ElButton>
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
            ><ElButton
              v-if="results.items.some((item) => item.status === 'failed')"
              :disabled="deleting"
              @click="retryFailed"
            >
              刷新并重新确认原失败项
            </ElButton>
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
        <ElButton v-if="pendingPublication" :disabled="deleting" @click="recoverPublication">
          查询并恢复本次发布
        </ElButton>
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
          <ElButton :disabled="busy || deleting" @click="selectPublicationFailures">
            仅重新选择原失败项
          </ElButton>
        </div>
        <div v-if="selected.length" class="between selection-bar">
          <span>已选当前页 {{ selected.length }} 篇</span>
          <div class="row">
            <ElButton :disabled="deleting" @click="selected = []">取消选择</ElButton
            ><ElButton
              class="primary"
              :disabled="deleting || !selectedPublications.length || Boolean(pendingPublication)"
              @click="publishArticles(selectedPublications)"
            >
              批量发布（{{ selectedPublications.length }}篇）</ElButton
            ><ElButton
              class="danger"
              :disabled="deleting"
              @click="confirmDelete(data?.items.filter((item) => selected.includes(item.id)) || [])"
            >
              批量删除
            </ElButton>
          </div>
        </div>
        <div v-if="data && data.items.length" class="table-wrap">
          <ElTable
            :data="data.items"
            row-key="id"
            class="articles-table"
            table-layout="fixed"
            :row-class-name="articleRowClass"
          >
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="" width="45" class-name="list-select-cell"
              ><template #header
                ><ElCheckbox
                  aria-label="全选当前页文章"
                  :model-value="allSelected"
                  :indeterminate="partialSelected"
                  @change="toggleAll" /></template
              ><template #default="{ row: item }"
                ><ElCheckbox
                  :model-value="selected.includes(item.id)"
                  :aria-label="`选择${item.payload.title_zh || item.id}`"
                  @change="
                    selected =
                      $event === true
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id)
                  " /></template
            ></ElTableColumn>
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="文章标题" :min-width="114"
              ><template #default="{ row: item }">
                <strong>{{ item.payload.title_zh || '中文标题待补充' }}</strong>
                <p class="muted">{{ item.payload.title_en || '英文标题待补充' }}</p>
                <small>{{ item.payload.tags.join(' · ') }}</small>
                <p class="muted small">创建于{{ dateText(item.created_at) }}</p>
              </template></ElTableColumn
            >
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="所属分类" :min-width="89"
              ><template #default="{ row: item }">
                {{ categoryName(item.category_id) }}
                <p class="muted small">{{ item.word_count }} 词</p>
              </template></ElTableColumn
            >
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="状态" :min-width="92"
              ><template #default="{ row: item }">
                <span class="badge" :class="item.status">{{ statusLabels[item.status] }}</span>

                <span :class="{ badge: item.is_free }">{{
                  item.is_free
                    ? item.status === 'published'
                      ? '免费开放'
                      : '免费已开启 · 发布后生效'
                    : '需学习授权'
                }}</span>
              </template></ElTableColumn
            >
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="全文音频" :min-width="51"
              ><template #default="{ row: item }">
                <span class="badge" :class="{ draft: !item.payload.audio_id }">{{
                  item.payload.audio_id ? '已关联' : '音频待补充'
                }}</span>
              </template></ElTableColumn
            >
            <!-- @vue-generic {Article} -->
            <ElTableColumn label="操作" :min-width="155"
              ><template #default="{ row: item }">
                <div class="table-row-actions">
                  <FreeAccessControl
                    :path="`/api/admin/v1/listening/articles/${item.id}/free-access`"
                    :is-free="item.is_free"
                    :revision="item.free_revision"
                    @changed="freeChanged"
                  />
                  <RouterLink
                    :to="{ path: `/listening/${item.id}`, query: { back: route.fullPath } }"
                    >编辑</RouterLink
                  ><ElButton class="text" @click="showPreview(item)">预览</ElButton
                  ><ElButton
                    v-if="item.status !== 'published' || item.has_unpublished_changes"
                    class="text"
                    :disabled="deleting || Boolean(pendingPublication)"
                    @click="publishArticles([item])"
                  >
                    发布</ElButton
                  ><ElButton
                    v-if="item.status === 'published'"
                    class="text"
                    @click="offline = item"
                  >
                    下线</ElButton
                  ><ElButton
                    class="text danger"
                    :disabled="deleting"
                    @click="confirmDelete([item])"
                  >
                    删除
                  </ElButton>
                </div>
              </template></ElTableColumn
            >
          </ElTable>
        </div>
        <div v-if="data" class="pagination">
          <span>共 {{ data.total }} 篇 · 每页10篇</span>
          <ElPagination
            :current-page="page"
            :page-size="10"
            :total="data.total"
            :disabled="busy"
            layout="prev, slot, next"
            prev-text="上一页"
            next-text="下一页"
            @current-change="filter({ page: $event })"
          >
            <span>第 {{ page }} 页</span>
          </ElPagination>
        </div>
      </ElConfigProvider>
    </div>
    <section v-if="preview" class="preview-workspace">
      <div class="page-heading between">
        <div>
          <h1>文章预览</h1>
          <p>核对当前编辑稿的排版与资料完整性</p>
        </div>
        <div class="row">
          <ElButton @click="closePreview">关闭预览</ElButton
          ><RouterLink
            class="button-link primary"
            :to="{ path: `/listening/${preview.id}`, query: { back: route.fullPath } }"
            >前往编辑并发布</RouterLink
          >
        </div>
      </div>
      <ListeningPreviewPanel
        v-if="preview"
        :article="{ ...preview, category_name: categoryName(preview.category_id) }"
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
            <span class="muted small">{{ categoryName(item.category_id) }}</span
            ><span class="badge">{{ statusLabels[item.status] }}</span>
          </div>
        </div>
      </div>
      <p class="muted small">共 {{ targets.length }} 篇。确认范围仅包含当前明确选择的文章</p>
      <template #footer
        ><ElButton :disabled="deleting" @click="confirmOpen = false">取消</ElButton
        ><ElButton class="danger" :disabled="deleting || !targets.length" @click="remove">
          确认删除{{ targets.length }}篇
        </ElButton></template
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
        <span class="muted small">{{ categoryName(offline.category_id) }}</span>
      </div>
      <p>下线后用户暂时无法学习本篇，后台可编辑并重新发布</p>
      <p class="muted small">用户已有收藏、学习记录与打卡成绩会保留</p>
      <p class="notice warning">
        {{
          offline?.is_free ? '本篇当前在免费名单内。' : ''
        }}下线后免费开关保留；其他文章的免费状态保持
      </p>
      <template #footer
        ><ElButton :disabled="deleting" @click="offline = null">取消</ElButton
        ><ElButton class="danger" :disabled="deleting" @click="takeOffline">
          确认下线
        </ElButton></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
@use '@/styles/content-lists';

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

  .articles-table {
    :deep(td[class~='el-table__cell']) {
      padding: 18px 0;
    }

    :deep(th[class~='el-table__cell']) {
      height: 62px;
    }

    :deep(.failed-row) {
      --el-table-tr-bg-color: #fff1e8;
    }
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

    :deep([class~='el-input__wrapper']),
    :deep([class~='el-select__wrapper']) {
      min-height: 40px;
      font-size: 12px;
    }

    > .el-select {
      flex: 0 1 142px;
      width: 142px;
      min-width: 142px;
    }
  }

  .search {
    position: relative;
    flex: 0 1 258px;
    min-width: 142px;

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
    background: var(--paper);
    min-height: 67px;

    p {
      display: flex;
      align-items: baseline;
      gap: 20px;
    }

    b {
      font-size: 24px;
      line-height: 36px;
      margin: 0 4px;
    }

    small {
      color: var(--muted);
      font-size: 13px;
    }
  }

  .el-tabs {
    --el-color-primary: var(--ink);

    :deep([class~='el-tabs__item']) {
      font-size: 15px;
    }
  }

  .selection-bar {
    padding: 12px 16px;
    background: var(--soft);
    margin: 18px 0;
  }

  .result-panel {
    margin: 18px 0;

    p {
      margin: 8px 0;
    }
  }
}
</style>

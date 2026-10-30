<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { listeningRecoverableOperation } from '@/services/listening-service'

import type { Article, Category, Topic } from './listening-types'
import type { components } from '@/shared/contracts/generated/admin-api'

const props = defineProps<{
  kind: 'categories' | 'topics'
  categories: Category[]
  topics: Topic[]
  articles: Article[]
}>()
const emit = defineEmits<{
  edit: [kind: 'category' | 'topic', item: Category | Topic]
  changed: []
}>()
type CatalogResult = components['schemas']['CatalogBatchDeleteResult']
const selected = ref<string[]>([]),
  page = ref(1),
  search = ref(''),
  category = ref(''),
  targets = ref<(Category | Topic)[]>([]),
  dialog = ref(false),
  busy = ref(false),
  error = ref(''),
  results = ref<CatalogResult | null>(null)
const pending = shallowRef<ReturnType<typeof listeningRecoverableOperation<CatalogResult>> | null>(
  null
)
const pendingOrder = shallowRef<ReturnType<typeof listeningRecoverableOperation<unknown>> | null>(
  null
)
const ordering = ref('')
const label = computed(() => (props.kind === 'categories' ? '分类' : '主题'))
const filtered = computed(() =>
  props.kind === 'categories'
    ? props.categories
    : props.topics.filter(
        (row) =>
          (!category.value || row.category_id === category.value) &&
          `${row.name_en} ${row.name}`.toLowerCase().includes(search.value.trim().toLowerCase())
      )
)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 10)))
const rows = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10))
const all = computed(() =>
  Boolean(rows.value.length && selected.value.length === rows.value.length)
)
const partial = computed(() => selected.value.length > 0 && !all.value)

/** 计算分类或主题当前有效发布数量
 * @param item 当前分类或主题
 * @returns 当前有效发布篇数
 */
const publishedCount = (item: Category | Topic) => {
  const ids =
    'category_id' in item
      ? [item.id]
      : props.topics.filter((topic) => topic.category_id === item.id).map((topic) => topic.id)
  return props.articles.filter(
    (article) =>
      article.status === 'published' && ids.includes(article.published_topic_id || article.topic_id)
  ).length
}
/** 当前页全选，不包括其他分页 */
const toggleAll = () => {
  selected.value = all.value ? [] : rows.value.map((row) => row.id)
}
/** 固定本次删除名单，行内删除只接收该行
 * @param items 管理员明确选中的目录项
 */
const confirm = (items: (Category | Topic)[]) => {
  if (pending.value || busy.value) return
  targets.value = items.map((item) => ({ ...item }))
  dialog.value = Boolean(items.length)
}
/** 使用固定名单和原幂等键删除，未知结果先查询回执 */
const remove = async () => {
  if (busy.value || !targets.value.length) return
  busy.value = true
  error.value = ''
  try {
    pending.value ||= listeningRecoverableOperation<CatalogResult>(
      'POST',
      `/${props.kind}/batch-delete`,
      { items: targets.value.map(({ id, revision }) => ({ id, revision })) }
    )
    results.value = await pending.value.run()
    pending.value = null
    dialog.value = false
    selected.value = []
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '删除结果未确认，请重试'
    if (!pending.value?.unknown) pending.value = null
  } finally {
    busy.value = false
  }
}
/** 保存已冻结的完整目录顺序，未知响应先查询原回执 */
const saveOrder = async () => {
  if (!pendingOrder.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await pendingOrder.value.run()
    pendingOrder.value = null
    ordering.value = ''
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '顺序保存失败'
    if (!pendingOrder.value?.unknown) pendingOrder.value = null
  } finally {
    busy.value = false
  }
}
/** 移动一项可见目录，提交完整集合与每项版本，保留其他分类的相对顺序
 * @param item 当前需要移动的分类或主题
 * @param direction 向前为-1，向后为1
 */
const move = async (item: Category | Topic, direction: number) => {
  if (busy.value || pending.value || pendingOrder.value) return
  const neighbor = filtered.value[filtered.value.indexOf(item) + direction]
  if (!neighbor) return
  const full = [...(props.kind === 'categories' ? props.categories : props.topics)]
  const from = full.indexOf(item),
    to = full.indexOf(neighbor)
  ;[full[from], full[to]] = [full[to]!, full[from]!]
  pendingOrder.value = listeningRecoverableOperation('PUT', `/${props.kind}/order`, {
    items: full.map(({ id, revision }) => ({ id, revision }))
  })
  await saveOrder()
}
/** 将服务端引用分类转换成可识别的业务说明
 * @param references 包含历史引用的真实数量
 * @returns 可识别的引用类型与数量
 */
const referenceText = (references: Record<string, number> = {}) =>
  Object.entries(references)
    .filter(([, count]) => count > 0)
    .map(
      ([kind, count]) =>
        `${({ topics: '主题', articles: '文章', deleted_articles: '已删除文章历史', candidates: '导入候选（含历史）' } as Record<string, string>)[kind] || '关联记录'}${count}项`
    )
    .join('，')
watch([search, category, () => props.kind], () => {
  page.value = 1
  selected.value = []
  results.value = null
})
watch(page, () => {
  selected.value = []
})
watch(pages, (total) => {
  page.value = Math.min(page.value, total)
})
</script>
<template>
  <div class="catalog-list">
    <div v-if="kind === 'topics'" class="row topic-filters">
      <label class="field"
        ><input v-model="search" aria-label="搜索主题" placeholder="搜索中英文主题名称"
      /></label>
      <select v-model="category" aria-label="筛选分类">
        <option value="">全部分类</option>
        <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <button v-if="pendingOrder" :disabled="busy" @click="saveOrder">重试保存顺序</button>
    <div v-if="selected.length" class="between selection-bar">
      <span>已选当前页{{ selected.length }}个{{ label }}</span>
      <div class="row">
        <button :disabled="busy" @click="selected = []">取消选择</button
        ><button :disabled="busy" @click="confirm(rows.filter((row) => selected.includes(row.id)))">
          批量删除
        </button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="selection-column">
              <input
                type="checkbox"
                :checked="all"
                :indeterminate="partial"
                :disabled="busy || !rows.length"
                :aria-label="'全选当前页' + label"
                @change="toggleAll"
              />
            </th>
            <th>{{ label }}名称</th>
            <th v-if="kind === 'categories'">主题数量</th>
            <th v-else>所属分类</th>
            <th>已发布文章</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id">
            <td>
              <input
                v-model="selected"
                type="checkbox"
                :value="item.id"
                :disabled="busy"
                :aria-label="'选择' + label + '：' + (item.name_en || item.name)"
              />
            </td>
            <td>
              <strong>{{ kind === 'topics' ? item.name_en || item.name : item.name }}</strong
              ><small v-if="kind === 'topics' ? item.name_en && item.name : item.name_en">{{
                kind === 'topics' ? item.name : item.name_en
              }}</small>
            </td>
            <td v-if="kind === 'categories'">
              {{ topics.filter((topic) => topic.category_id === item.id).length }}个主题
            </td>
            <td v-else>
              {{
                categories.find((row) => row.id === ('category_id' in item ? item.category_id : ''))
                  ?.name
              }}
            </td>
            <td>{{ publishedCount(item) }}篇</td>
            <td>
              <div class="row">
                <button
                  class="text"
                  :disabled="busy || Boolean(pendingOrder)"
                  @click="emit('edit', kind === 'categories' ? 'category' : 'topic', item)"
                >
                  编辑</button
                ><button
                  class="text"
                  :disabled="busy || Boolean(pendingOrder)"
                  @click="ordering = ordering === item.id ? '' : item.id"
                >
                  调整顺序</button
                ><RouterLink
                  v-if="kind === 'topics'"
                  :to="{ path: '/listening', query: { topic_id: item.id } }"
                  >管理篇目</RouterLink
                ><RouterLink
                  v-if="kind === 'topics'"
                  :to="{ path: '/listening/topic-order', query: { topic_id: item.id } }"
                  >篇目排序</RouterLink
                ><button
                  class="text danger"
                  :disabled="busy || Boolean(pendingOrder)"
                  @click="confirm([item])"
                >
                  删除
                </button>
              </div>
              <div v-if="ordering === item.id" class="row">
                <button
                  class="text"
                  :aria-label="'上移' + (item.name_en || item.name)"
                  :disabled="busy || filtered.indexOf(item) === 0 || Boolean(pendingOrder)"
                  @click="move(item, -1)"
                >
                  上移</button
                ><button
                  class="text"
                  :aria-label="'下移' + (item.name_en || item.name)"
                  :disabled="
                    busy || filtered.indexOf(item) === filtered.length - 1 || Boolean(pendingOrder)
                  "
                  @click="move(item, 1)"
                >
                  下移
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="notice">暂无符合条件的{{ label }}</p>
    <div class="between pagination">
      <span>共{{ filtered.length }}个{{ label }} · 每页10项</span>
      <div class="row">
        <button :disabled="busy || page <= 1" @click="page--">上一页</button
        ><span>{{ page }} / {{ pages }}</span
        ><button :disabled="busy || page >= pages" @click="page++">下一页</button>
      </div>
    </div>
    <div
      v-if="results?.items.some((item) => item.status === 'failed')"
      class="notice error"
      role="alert"
    >
      <p>以下项目未删除，请处理引用或刷新后重新选择</p>
      <p v-for="item in results.items.filter((row) => row.status === 'failed')" :key="item.id">
        {{
          targets.find((row) => row.id === item.id)?.name_en ||
          targets.find((row) => row.id === item.id)?.name
        }}：{{ item.message || '目录已变化，请刷新'
        }}<span v-if="item.references">（{{ referenceText(item.references) }}）</span>
      </p>
    </div>
    <ElDialog
      v-model="dialog"
      :title="`确认删除${targets.length}个${label}`"
      width="620px"
      :close-on-click-modal="false"
      :show-close="!busy && !pending"
      :close-on-press-escape="!busy && !pending"
      ><p>仅删除本次选择且无任何引用的{{ label }}，有引用的项目会保留并说明原因</p>
      <ul>
        <li v-for="item in targets" :key="item.id">
          {{ item.name_en || item.name
          }}<span v-if="item.name_en && item.name"> / {{ item.name }}</span>
        </li>
      </ul>
      <p v-if="error" class="notice error">{{ error }}</p>
      <template #footer
        ><button :disabled="busy || Boolean(pending)" @click="dialog = false">取消</button
        ><button class="danger" :disabled="busy" @click="remove">
          {{ pending ? '重试删除' : `确认删除${targets.length}个${label}` }}
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.catalog-list {
  .selection-bar {
    margin-bottom: 12px;
    padding: 16px;
    border-radius: 10px;
    background: #edf4e8;
  }

  .selection-column {
    width: 46px;
  }

  td {
    vertical-align: middle;

    strong {
      display: block;
      font-weight: 500;
    }

    small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
    }
  }

  .pagination {
    margin-top: 18px;
    color: var(--muted);
    font-size: 12px;
  }
}
</style>

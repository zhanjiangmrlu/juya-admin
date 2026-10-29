<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import dragIcon from '@/assets/icons/drag.svg'
import AppState from '@/components/app-state/app-state.vue'
import {
  listeningOperation,
  listeningRecoverableOperation,
  listeningRequest
} from '@/services/listening-service'

import type {
  Article,
  Category,
  FreePolicy,
  FreePreview,
  Order,
  Page,
  Topic
} from './listening-types'

import { moveArticle, statusLabels } from './listening-model'

const props = defineProps<{
  initial: 'hierarchy' | 'order' | 'free'
  surface?: 'categories' | 'topics' | 'topic-order' | 'global-order'
  topicId?: string
}>()
const emit = defineEmits<{ changed: []; topicName: [name: string] }>()
const tab = ref(props.initial),
  categories = ref<Category[]>([]),
  topics = ref<Topic[]>([]),
  articles = ref<Article[]>([]),
  policy = ref<FreePolicy | null>(null),
  freeInput = ref(''),
  freePreview = ref<FreePreview | null>(null),
  order = ref<Order | null>(null),
  scope = ref<'global' | 'topic'>(props.surface === 'topic-order' ? 'topic' : 'global'),
  topic = ref(props.topicId || ''),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
const edit = ref<{
  kind: 'category' | 'topic'
  id: string
  revision: number
  name: string
  sort_order: number
  category_id: string
  name_en: string
  description: string
} | null>(null)
const pendingHierarchy = shallowRef<{
  snapshot: string
  operation: ReturnType<typeof listeningRecoverableOperation<Category | Topic>>
} | null>(null)
const topicSearch = ref(''),
  categoryFilter = ref(''),
  orderConfirm = ref(false),
  freeConfirm = ref(false),
  savedOrder = ref<string[]>([]),
  draggedId = ref('')
const visibleTopics = computed(() =>
  topics.value.filter(
    (item) =>
      (!categoryFilter.value || item.category_id === categoryFilter.value) &&
      item.name.includes(topicSearch.value.trim())
  )
)
/** 计算实际有效发布的文章数
 * @param ids 已确认主题编号集合
 * @returns 当前有效已发布篇数
 */
const publishedCount = (ids: string[]) =>
  articles.value.filter(
    (item) => item.status === 'published' && ids.includes(item.published_topic_id || item.topic_id)
  ).length
const freeValid = computed(
  () => /^\d+$/.test(freeInput.value.trim()) && Number.isSafeInteger(Number(freeInput.value))
)
const freePreviewCurrent = computed(() =>
  Boolean(
    freePreview.value && freeValid.value && freePreview.value.free_count === Number(freeInput.value)
  )
)
let freePreviewGeneration = 0
/** 将文章编号转换为真实双标题，未读到资料时保留编号供核对
 * @param id 当前名单或排序中的稳定文章编号
 * @returns 管理员核对对象名称
 */
const title = (id: string) => {
  const value = articles.value.find((item) => item.id === id)
  return value
    ? `${value.payload.title_zh || '标题待补充'} / ${value.payload.title_en || '英文待补充'}`
    : id
}
/** 读取独立配置及完整有效文章集合，不按当前管理页计算名单 */
const load = async () => {
  busy.value = true
  error.value = ''
  try {
    const [c, t, p] = await Promise.all([
      listeningRequest<{ items: Category[] }>('/categories'),
      listeningRequest<{ items: Topic[] }>('/topics'),
      listeningRequest<FreePolicy>('/free-policy')
    ])
    categories.value = c.items
    topics.value = t.items
    policy.value = p
    freeInput.value = p.configured ? String(p.free_count) : ''
    const full: Article[] = []
    let page = 1,
      total = 0
    do {
      const value = await listeningRequest<Page<Article>>(`/articles?page=${page}&limit=50`)
      full.push(...value.items)
      total = value.total
      if (!value.items.length) break
      page++
    } while (full.length < total)
    articles.value = full
    if (tab.value === 'order') await loadOrder()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '读取失败'
  } finally {
    busy.value = false
  }
}
/** 根据所选独立作用域读取完整顺序 */
const loadOrder = async () => {
  order.value = null
  if (scope.value === 'topic' && !topic.value) return
  busy.value = true
  error.value = ''
  try {
    order.value = await listeningRequest<Order>(
      `/order?scope=${scope.value}${scope.value === 'topic' ? `&topic_id=${topic.value}` : ''}`
    )
    savedOrder.value = [...order.value.article_ids]
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '顺序读取失败'
  } finally {
    busy.value = false
  }
}
/** 打开新增或修改分类主题的表单
 * @param kind 分类或主题
 * @param item 已有资料，未传时为新建
 */
const openEdit = (kind: 'category' | 'topic', item?: Category | Topic) => {
  if (pendingHierarchy.value) {
    error.value = '请先保存以确认上次操作结果，再编辑其他对象'
    return
  }
  edit.value = {
    kind,
    id: item?.id || '',
    revision: item?.revision || 0,
    name: item?.name || '',
    sort_order: item?.sort_order || 0,
    category_id: item && 'category_id' in item ? item.category_id : categories.value[0]?.id || '',
    name_en: item && 'name_en' in item ? item.name_en : '',
    description: item && 'description' in item ? item.description : ''
  }
}
/** 保存分类主题及其归属和显示序号 */
const saveHierarchy = async () => {
  const item = edit.value
  if (!item || !item.name.trim() || (item.kind === 'topic' && !item.category_id)) return
  busy.value = true
  error.value = ''
  try {
    const snapshot = JSON.stringify(item)
    if (pendingHierarchy.value) {
      const originalSnapshot = pendingHierarchy.value.snapshot
      const confirmed = await pendingHierarchy.value.operation.run()
      pendingHierarchy.value = null
      item.id = confirmed.id
      item.revision = confirmed.revision
      if (originalSnapshot === snapshot) {
        edit.value = null
        await load()
        emit('changed')
        return
      }
    }
    const collection = item.kind === 'category' ? '/categories' : '/topics'
    const operation = listeningRecoverableOperation<Category | Topic>(
      item.id ? 'PUT' : 'POST',
      `${collection}${item.id ? `/${item.id}` : ''}`,
      {
        name: item.name.trim(),
        sort_order: item.sort_order,
        ...(item.id ? { revision: item.revision } : {}),
        ...(item.kind === 'topic'
          ? { category_id: item.category_id, description: item.description, name_en: item.name_en }
          : { name_en: item.name_en })
      }
    )
    pendingHierarchy.value = { snapshot: JSON.stringify(item), operation }
    await operation.run()
    pendingHierarchy.value = null
    edit.value = null
    await load()
    emit('changed')
  } catch (reason) {
    if (pendingHierarchy.value && !pendingHierarchy.value.operation.unknown)
      pendingHierarchy.value = null
    error.value = reason instanceof Error ? reason.message : '保存失败，输入已保留'
  } finally {
    busy.value = false
  }
}
/** 保存这一作用域的完整文章集合，冲突后要求重新读取 */
const submitOrder = async () => {
  if (!order.value) return
  busy.value = true
  error.value = ''
  try {
    order.value = await listeningOperation<Order>('PUT', '/order', {
      ...order.value,
      scope: scope.value,
      ...(scope.value === 'topic' ? { topic_id: topic.value } : {})
    })()
    orderConfirm.value = false
    savedOrder.value = [...order.value.article_ids]
    notice.value = '当前作用域顺序已保存'
    freePreview.value = null
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请重新读取顺序后确认'
  } finally {
    busy.value = false
  }
}
/** 全局排序先核对免费名单影响，主题排序直接明确保存 */
const saveOrder = () => {
  if (scope.value === 'global') orderConfirm.value = true
  else void submitOrder()
}
/** 请求服务端计算全局前M篇及名单变化 */
const previewFree = async () => {
  if (!freeValid.value || busy.value) return
  const freeCount = Number(freeInput.value),
    generation = ++freePreviewGeneration
  freePreview.value = null
  freeConfirm.value = false
  busy.value = true
  error.value = ''
  try {
    const result = await listeningOperation<FreePreview>('POST', '/free-policy/preview', {
      free_count: freeCount
    })()
    // 输入或请求轮次变化时，旧令牌不得恢复到当前确认范围
    if (
      generation !== freePreviewGeneration ||
      !freeValid.value ||
      Number(freeInput.value) !== freeCount ||
      result.free_count !== freeCount
    ) {
      error.value = '免费篇数已变化，请重新预览名单'
      return
    }
    freePreview.value = result
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '名单计算失败'
  } finally {
    busy.value = false
  }
}
/** 管理员核对完整名单后提交当前确认令牌 */
const saveFree = async () => {
  if (!freePreview.value || !freePreviewCurrent.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    policy.value = await listeningOperation<FreePolicy>('PUT', '/free-policy', {
      preview_token: freePreview.value.preview_token
    })()
    freeConfirm.value = false
    notice.value = '听读免费M已保存'
    freePreview.value = null
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请重新预览完整名单'
    freeConfirm.value = false
    freePreview.value = null
  } finally {
    busy.value = false
  }
}
/** 仅从拖动手柄开始排序，参数为原生拖动事件与待移动文章编号
 * @param event 原生拖动事件，用于声明移动操作
 * @param id 管理员选择的文章编号
 */
const startDrag = (event: DragEvent, id: string) => {
  if (busy.value) return
  draggedId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}
/** 将当前拖动文章移到落点位置，保持完整文章集合
 * @param targetId 管理员放置位置对应的文章编号
 */
const dropArticle = (targetId: string) => {
  if (!order.value || busy.value || !draggedId.value) return
  const ids = [...order.value.article_ids]
  const from = ids.indexOf(draggedId.value),
    target = ids.indexOf(targetId)
  if (from >= 0 && target >= 0) {
    ids.splice(from, 1)
    ids.splice(target, 0, draggedId.value)
    order.value.article_ids = ids
  }
  draggedId.value = ''
}
/** 放弃当前未保存排序，恢复本作用域最近一次已确认顺序 */
const cancelOrder = () => {
  if (order.value) order.value.article_ids = [...savedOrder.value]
  orderConfirm.value = false
}
/** 返回文章发布归属的分类和主题
 * @param id 当前排序或免费名单中的文章编号
 * @returns 可核对的分类主题名称
 */
const affiliation = (id: string) => {
  const article = articles.value.find((item) => item.id === id)
  const item = topics.value.find(
    (item) => item.id === (article?.published_topic_id || article?.topic_id)
  )
  return (
    [categories.value.find((category) => category.id === item?.category_id)?.name, item?.name]
      .filter(Boolean)
      .join(' / ') || '归属待确认'
  )
}
watch(freeInput, () => {
  freePreviewGeneration++
  freeConfirm.value = false
  freePreview.value = null
})
watch([scope, topic], () => {
  void loadOrder()
})
watch([topic, topics], () => {
  emit('topicName', topics.value.find((item) => item.id === topic.value)?.name || '')
})
watch(tab, (value) => {
  notice.value = ''
  if (value === 'order') void loadOrder()
})
defineExpose({ openEdit })
onMounted(load)
</script>
<template>
  <div class="listening-settings">
    <AppState :busy="busy" :error="error" @retry="load" />
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <template v-if="tab === 'hierarchy'">
      <template v-if="surface === 'categories'">
        <div v-if="!busy && !error" class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>分类名称</th>
                <th>英文名称</th>
                <th>主题数量</th>
                <th>已发布文章</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in categories" :key="item.id">
                <td>{{ item.name }}</td>
                <td>{{ item.name_en || '未填写' }}</td>
                <td>{{ topics.filter((t) => t.category_id === item.id).length }} 个主题</td>
                <td>
                  {{
                    publishedCount(topics.filter((t) => t.category_id === item.id).map((t) => t.id))
                  }}
                  篇
                </td>
                <td>
                  <button class="text" @click="openEdit('category', item)">编辑</button
                  ><button class="text" @click="openEdit('category', item)">调整顺序</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!categories.length && !busy && !error" class="notice">暂无分类，请先新增</p>
      </template>
      <template v-else>
        <div class="row topic-filters">
          <label class="field"
            ><input v-model="topicSearch" aria-label="搜索主题" placeholder="输入主题名称" /></label
          ><label class="field"
            ><select v-model="categoryFilter" aria-label="筛选分类">
              <option value="">全部分类</option>
              <option v-for="item in categories" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select></label
          >
        </div>
        <div v-if="!busy && !error" class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>主题名称</th>
                <th>所属分类</th>
                <th>已发布文章</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visibleTopics" :key="item.id">
                <td>{{ item.name }}</td>
                <td>{{ categories.find((c) => c.id === item.category_id)?.name }}</td>
                <td>{{ publishedCount([item.id]) }} 篇</td>
                <td>
                  <div class="row">
                    <button class="text" @click="openEdit('topic', item)">编辑主题</button
                    ><RouterLink :to="{ path: '/listening', query: { topic_id: item.id } }"
                      >管理篇目</RouterLink
                    ><RouterLink
                      :to="{ path: '/listening/topic-order', query: { topic_id: item.id } }"
                      >调整顺序</RouterLink
                    >
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!visibleTopics.length && !busy && !error" class="notice">暂无符合条件的主题</p>
      </template>
      <div v-if="edit" class="edit-layout" :class="{ 'category-edit': surface === 'categories' }">
        <form class="panel hierarchy-form" @submit.prevent="saveHierarchy">
          <h2>{{ edit.id ? '编辑' : '新增' }}{{ edit.kind === 'category' ? '分类' : '主题' }}</h2>
          <div class="form-grid">
            <label class="field"
              >{{ edit.kind === 'category' ? '中文名称' : '主题名称'
              }}<input v-model="edit.name" required /></label
            ><label v-if="edit.kind === 'topic'" class="field"
              >所属分类<select v-model="edit.category_id" required>
                <option v-for="item in categories" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select></label
            ><label class="field">英文名称（选填）<input v-model="edit.name_en" /></label
            ><label class="field"
              >显示序号<input v-model.number="edit.sort_order" type="number" step="1" required
            /></label>
          </div>
          <label v-if="edit.kind === 'topic'" class="field"
            >主题简介（选填）<textarea v-model="edit.description" rows="2" />
          </label>
          <div class="row">
            <button class="primary" :disabled="busy">
              保存{{ edit.kind === 'category' ? '分类' : '主题' }}</button
            ><button
              type="button"
              :disabled="busy || Boolean(pendingHierarchy)"
              @click="edit = null"
            >
              取消
            </button>
          </div>
        </form>
        <p v-if="surface === 'categories'" class="notice">
          分类名称更新后，关联主题与文章保持不变。无有效发布篇目的分类暂不出现在用户端
        </p>
      </div>
    </template>
    <template v-else-if="tab === 'order'"
      ><p class="notice">主题内顺序与免费全局顺序独立保存，互不改写。全局只含有效已发布文章</p>
      <label v-if="!surface" class="field"
        >排序范围<select v-model="scope">
          <option value="global">免费全局顺序</option>
          <option value="topic">主题内顺序</option>
        </select></label
      ><label v-if="scope === 'topic'" class="field"
        >选择主题<select v-model="topic">
          <option value="">请选择</option>
          <option v-for="item in topics" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select></label
      ><template v-if="order"
        ><div
          v-for="(id, index) in order.article_ids"
          :key="id"
          class="between catalog-row order-row"
          :class="{
            free: scope === 'global' && policy?.article_ids.includes(id),
            dragging: draggedId === id
          }"
          @dragover.prevent
          @drop.prevent="dropArticle(id)"
        >
          <button
            type="button"
            class="drag-handle text"
            :draggable="!busy"
            :disabled="busy"
            :aria-label="`拖动排序：${title(id)}`"
            @dragstart="startDrag($event, id)"
            @dragend="draggedId = ''"
          >
            <img :src="dragIcon" width="19" height="19" alt="" aria-hidden="true" /></button
          ><span class="order-number">{{ index + 1 }}</span
          ><span class="order-title"
            ><strong>{{ articles.find((item) => item.id === id)?.payload.title_zh || id }}</strong
            ><small>{{ articles.find((item) => item.id === id)?.payload.title_en }}</small></span
          >
          <span class="muted small">{{ affiliation(id) }}</span
          ><span v-if="scope === 'topic'" class="badge">{{
            statusLabels[articles.find((item) => item.id === id)?.status || '']
          }}</span
          ><span v-if="scope === 'global' && policy?.article_ids.includes(id)" class="badge"
            >当前免费</span
          >
          <div class="row">
            <button
              :disabled="busy || index === 0"
              :aria-label="`上移${title(id)}`"
              @click="order.article_ids = moveArticle(order.article_ids, id, -1)"
            >
              上移</button
            ><button
              :disabled="busy || index === order.article_ids.length - 1"
              :aria-label="`下移${title(id)}`"
              @click="order.article_ids = moveArticle(order.article_ids, id, 1)"
            >
              下移
            </button>
          </div>
        </div>
        <div class="row section-heading">
          <button :disabled="busy" @click="cancelOrder">取消调整</button
          ><button class="primary" :disabled="busy" @click="saveOrder">
            {{ scope === 'global' ? '核对名单并保存' : '保存顺序' }}
          </button>
        </div></template
      ></template
    >
    <template v-else
      ><p class="notice">
        {{
          policy?.configured ? `当前M=${policy.free_count}` : '听读免费M尚未确认，当前听读不开放'
        }}。场景N和用户学习授权不受此设置影响
      </p>
      <div class="between free-summary">
        <span class="badge">当前M={{ policy?.configured ? policy.free_count : '未设置' }}</span
        ><span class="muted small"
          >已发布 {{ articles.filter((item) => item.status === 'published').length }} 篇</span
        >
      </div>
      <label class="field free-input"
        >免费篇数M<input
          v-model="freeInput"
          :disabled="busy"
          inputmode="numeric"
          placeholder="请输入非负整数，0表示无免费篇"
        /><small>按全量有效发布文章的全局顺序取前M篇，超过总数则全部免费；完成不补位</small></label
      ><button class="primary" :disabled="busy || !freeValid" @click="previewFree">
        预览名单与影响</button
      ><template v-if="freePreview"
        ><h3 class="section-heading">将生效的完整名单（{{ freePreview.article_ids.length }}篇）</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>顺序</th>
                <th>文章</th>
                <th>分类 / 主题</th>
                <th>名单变化</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(id, index) in freePreview.article_ids" :key="id">
                <td>{{ index + 1 }}</td>
                <td>{{ title(id) }}</td>
                <td>{{ affiliation(id) }}</td>
                <td>
                  <span class="badge">{{
                    freePreview.added_ids.includes(id) ? '新增免费' : '保持免费'
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!freePreview.article_ids.length" class="muted">没有免费文章</p>
        <p>
          新增 {{ freePreview.added_ids.length }} 篇；移出 {{ freePreview.removed_ids.length }} 篇
        </p>
        <ul>
          <li v-for="id in freePreview.added_ids" :key="`add-${id}`">新增：{{ title(id) }}</li>
          <li v-for="id in freePreview.removed_ids" :key="`remove-${id}`">移出：{{ title(id) }}</li>
        </ul>
        <div class="row">
          <button :disabled="busy" @click="freePreview = null">取消</button
          ><button
            class="primary"
            :disabled="busy || !freePreviewCurrent"
            @click="freeConfirm = true"
          >
            保存免费设置
          </button>
        </div></template
      ></template
    >
    <ElDialog
      v-model="freeConfirm"
      title="确认调整听读免费篇数"
      width="620px"
      :close-on-click-modal="false"
    >
      <template v-if="freePreview"
        ><div class="policy-summary">
          <span
            >当前免费篇数 <strong>{{ policy?.free_count ?? '未设置' }}</strong></span
          ><span
            >调整后免费篇数 <strong>{{ freePreview.free_count }}</strong></span
          >
        </div>
        <p class="notice">
          新增免费 {{ freePreview.added_ids.length }} 篇，移出免费
          {{ freePreview.removed_ids.length }} 篇。已完成记录保留，当前访问以最新授权和免费名单为准
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>变化</th>
                <th>文章</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="id in freePreview.added_ids" :key="id">
                <td>新增免费</td>
                <td>{{ title(id) }}</td>
              </tr>
              <tr v-for="id in freePreview.removed_ids" :key="id">
                <td>移出免费</td>
                <td>{{ title(id) }}</td>
              </tr>
            </tbody>
          </table>
        </div></template
      ><template #footer
        ><button :disabled="busy" @click="freeConfirm = false">返回核对</button
        ><button class="primary" :disabled="busy || !freePreviewCurrent" @click="saveFree">
          确认保存M与名单
        </button></template
      >
    </ElDialog>
    <ElDialog
      v-model="orderConfirm"
      title="核对全局顺序与免费名单"
      width="760px"
      :close-on-click-modal="false"
      ><p class="notice">
        {{
          policy?.configured
            ? `当前M=${policy.free_count}，按本次完整全局顺序计算以下免费名单`
            : 'M尚未配置，保存顺序不会自动开放听读'
        }}；主题内顺序保持不变
      </p>
      <ol v-if="policy?.configured">
        <li v-for="id in order?.article_ids.slice(0, policy.free_count || 0)" :key="id">
          {{ title(id) }}{{ policy.article_ids.includes(id) ? '' : ' · 将新增免费' }}
        </li>
      </ol>
      <p
        v-for="id in policy?.article_ids.filter(
          (id) => !order?.article_ids.slice(0, policy?.free_count || 0).includes(id)
        )"
        :key="id"
      >
        将移出免费：{{ title(id) }}
      </p>
      <template #footer
        ><button :disabled="busy" @click="orderConfirm = false">取消</button
        ><button class="primary" :disabled="busy" @click="submitOrder">
          确认保存全局顺序
        </button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.listening-settings {
  table th {
    font-size: 12px;
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .free-summary {
    margin: 16px 0;
  }

  .free-input input {
    max-width: 220px;
  }

  .policy-summary {
    display: flex;
    gap: 40px;
    padding: 20px;
    background: var(--soft);
    border-radius: 10px;

    strong {
      display: block;
      font-size: 28px;
      margin-top: 8px;
    }
  }

  .drag-handle {
    cursor: grab;
    padding: 0 8px;
  }

  .dragging {
    opacity: 0.5;
  }

  .topic-filters {
    margin-bottom: 20px;

    .field {
      width: 220px;
      margin: 0;
    }
  }

  .edit-layout {
    display: block;
    margin-top: 24px;
    align-items: start;

    &.category-edit {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 310px;
      gap: 24px;
    }
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 24px;
  }

  .catalog-row.order-row {
    background: var(--paper);
    padding: 17px 20px;
    min-height: 70px;
    gap: 15px;
    border: 1px solid var(--line);
    margin-top: -1px;

    &:where(.free) {
      background: var(--soft);
    }
  }

  .order-number {
    width: 24px;
    color: var(--muted);
  }

  .order-title {
    margin-right: auto;

    strong,
    small {
      display: block;
    }

    small {
      color: var(--muted);
    }
  }

  .section-heading {
    margin: 24px 0 16px;
  }

  .catalog-row {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }

  .hierarchy-form {
    margin: 0;
  }

  li {
    margin: 8px 0;
  }
}
</style>

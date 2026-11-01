<script setup lang="ts">
import { ElButton, ElInput, ElOption, ElSelect } from 'element-plus'
import { onMounted, ref, shallowRef, watch } from 'vue'

import dragIcon from '@/assets/icons/drag.svg'
import AppState from '@/components/app-state/app-state.vue'
import { listeningRecoverableOperation, listeningRequest } from '@/services/listening-service'

import type { Article, Category, Order, Page } from './listening-types'

import ListeningCatalogList from './listening-catalog-list.vue'
import { moveArticle, statusLabels } from './listening-model'
const props = defineProps<{
  initial: 'hierarchy' | 'order'
  surface?: 'categories' | 'category-order'
  categoryId?: string
}>()
const emit = defineEmits<{ changed: []; categoryName: [name: string] }>()
const categories = ref<Category[]>([]),
  articles = ref<Article[]>([]),
  category = ref(props.categoryId || ''),
  order = ref<Order | null>(null),
  savedOrder = ref<string[]>([]),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  draggedId = ref('')
const edit = ref<{
  id: string
  revision: number
  name: string
  name_en: string
  sort_order: number
} | null>(null)
const pendingHierarchy = shallowRef<ReturnType<
  typeof listeningRecoverableOperation<Category>
> | null>(null)
const pendingOrder = shallowRef<ReturnType<typeof listeningRecoverableOperation<Order>> | null>(
  null
)
/** 读取直接分类与全部非删除文章，数量和篇序不受当前分页限制 */
const load = async () => {
  busy.value = true
  error.value = ''
  try {
    categories.value = (await listeningRequest<{ items: Category[] }>('/categories')).items
    const full: Article[] = []
    let page = 1,
      total = 0
    do {
      const result = await listeningRequest<Page<Article>>(`/articles?page=${page}&limit=50`)
      full.push(...result.items)
      total = result.total
      if (!result.items.length) break
      page++
    } while (full.length < total)
    articles.value = full
    emit('categoryName', categories.value.find((item) => item.id === category.value)?.name || '')
    if (props.initial === 'order') await loadOrder()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '读取失败'
  } finally {
    busy.value = false
  }
}
/** 读取所选分类的完整篇序，禁止发送历史全局免费顺序 */
const loadOrder = async () => {
  if (!category.value) {
    order.value = null
    return
  }
  try {
    order.value = await listeningRequest<Order>(
      `/order?scope=category&category_id=${encodeURIComponent(category.value)}`
    )
    savedOrder.value = [...order.value.article_ids]
    emit('categoryName', categories.value.find((item) => item.id === category.value)?.name || '')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '顺序读取失败'
  }
}
/** 打开直接分类编辑并保留原顺序
 * @param _kind 兼容分类列表传递的分类标记
 * @param item 当前分类，不传则新增
 */
const openEdit = (_kind: 'category', item?: Category) => {
  if (pendingHierarchy.value) {
    error.value = '请先重试保存以确认上次结果'
    return
  }
  edit.value = item
    ? { ...item }
    : { id: '', revision: 0, name: '', name_en: '', sort_order: categories.value.length }
}
/** 保存分类，未知响应保留固定正文和原幂等键 */
const saveHierarchy = async () => {
  if (!edit.value?.name.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const item = edit.value
    pendingHierarchy.value ||= listeningRecoverableOperation<Category>(
      item.id ? 'PUT' : 'POST',
      `/categories${item.id ? `/${item.id}` : ''}`,
      {
        name: item.name.trim(),
        name_en: item.name_en,
        sort_order: item.sort_order,
        ...(item.id ? { revision: item.revision } : {})
      }
    )
    await pendingHierarchy.value.run()
    pendingHierarchy.value = null
    edit.value = null
    await load()
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，输入保留'
    if (!pendingHierarchy.value?.unknown) pendingHierarchy.value = null
  } finally {
    busy.value = false
  }
}
/** 冻结并保存当前分类篇序，未知先查回执 */
const saveOrder = async () => {
  if (!order.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    pendingOrder.value ||= listeningRecoverableOperation<Order>(
      'PUT',
      `/order?scope=category&category_id=${encodeURIComponent(category.value)}`,
      { scope: 'category', category_id: category.value, ...order.value }
    )
    order.value = await pendingOrder.value.run()
    pendingOrder.value = null
    savedOrder.value = [...order.value.article_ids]
    notice.value = '分类内文章顺序已保存'
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败'
    if (!pendingOrder.value?.unknown) pendingOrder.value = null
  } finally {
    busy.value = false
  }
}
/** 取消尚未提交的排序，恢复已读取顺序 */
const cancelOrder = () => {
  if (order.value && !pendingOrder.value) order.value.article_ids = [...savedOrder.value]
}
/** 读取可识别的双标题
 * @param id 当前篇序中的文章编号
 * @returns 可识别的文章双标题
 */
const title = (id: string) => {
  const item = articles.value.find((item) => item.id === id)
  return item ? `${item.payload.title_zh} / ${item.payload.title_en}` : id
}
/** 开始拖动一篇文章
 * @param event 当前拖拽事件
 * @param id 管理员选中的文章编号
 */
const startDrag = (event: DragEvent, id: string) => {
  draggedId.value = id
  event.dataTransfer?.setData('text/plain', id)
}
/** 将选中的文章放到当前目标位置
 * @param id 目标文章编号
 */
const dropArticle = (id: string) => {
  if (!order.value || pendingOrder.value || busy.value) return
  const ids = [...order.value.article_ids],
    from = ids.indexOf(draggedId.value),
    to = ids.indexOf(id)
  if (from >= 0 && to >= 0) {
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId.value)
    order.value.article_ids = ids
  }
  draggedId.value = ''
}
watch(category, () => {
  notice.value = ''
  void loadOrder()
})
onMounted(load)
defineExpose({ openEdit })
</script>
<template>
  <div class="listening-settings">
    <AppState :error="error" :busy="busy" @retry="load" />
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <template v-if="initial === 'hierarchy'">
      <ListeningCatalogList
        :categories="categories"
        :articles="articles"
        @edit="openEdit"
        @changed="load"
      />
      <form v-if="edit" class="panel hierarchy-form" @submit.prevent="saveHierarchy">
        <h2>{{ edit.id ? '编辑分类' : '新增分类' }}</h2>
        <label class="field"
          >分类名称 *<ElInput
            v-model="edit.name"
            :disabled="busy || Boolean(pendingHierarchy)"
            aria-label="分类名称" /></label
        ><label class="field"
          >英文名称（选填）<ElInput
            v-model="edit.name_en"
            :disabled="busy || Boolean(pendingHierarchy)"
        /></label>
        <div class="row">
          <ElButton :disabled="busy || Boolean(pendingHierarchy)" @click="edit = null"
            >取消</ElButton
          ><ElButton
            type="primary"
            native-type="submit"
            :loading="busy"
            :disabled="!edit.name.trim()"
            >{{ pendingHierarchy ? '查询并恢复保存' : '保存分类' }}</ElButton
          >
        </div>
      </form>
    </template>
    <template v-else>
      <p class="notice">只调整当前分类内篇序；保留文章身份、免费开关、学习进度和时间轴</p>
      <label v-if="!categoryId" class="field"
        >选择分类<ElSelect v-model="category" :disabled="Boolean(pendingOrder)"
          ><ElOption
            v-for="item in categories"
            :key="item.id"
            :value="item.id"
            :label="item.name" /></ElSelect
      ></label>
      <template v-if="order"
        ><div
          v-for="(id, index) in order.article_ids"
          :key="id"
          class="between order-row"
          @dragover.prevent
          @drop.prevent="dropArticle(id)"
        >
          <ElButton
            link
            :draggable="!busy && !pendingOrder"
            :aria-label="`拖动排序：${title(id)}`"
            @dragstart="startDrag($event, id)"
            @dragend="draggedId = ''"
            ><img :src="dragIcon" width="19" height="19" alt="" /></ElButton
          ><span class="order-title"
            ><strong>{{ articles.find((item) => item.id === id)?.payload.title_zh || id }}</strong
            ><small>{{ articles.find((item) => item.id === id)?.payload.title_en }}</small></span
          ><span class="badge">{{
            statusLabels[articles.find((item) => item.id === id)?.status || '']
          }}</span>
          <div class="row">
            <ElButton
              :disabled="busy || index === 0 || Boolean(pendingOrder)"
              :aria-label="`上移${title(id)}`"
              @click="order.article_ids = moveArticle(order.article_ids, id, -1)"
              >上移</ElButton
            ><ElButton
              :disabled="busy || index === order.article_ids.length - 1 || Boolean(pendingOrder)"
              @click="order.article_ids = moveArticle(order.article_ids, id, 1)"
              >下移</ElButton
            >
          </div>
        </div>
        <div class="row section-heading">
          <ElButton :disabled="busy || Boolean(pendingOrder)" @click="cancelOrder"
            >取消调整</ElButton
          ><ElButton type="primary" :loading="busy" @click="saveOrder">{{
            pendingOrder ? '查询并恢复本次排序' : '保存顺序'
          }}</ElButton>
        </div></template
      >
    </template>
  </div>
</template>
<style scoped lang="scss">
.listening-settings {
  .hierarchy-form {
    padding: 24px;
    margin-top: 24px;
    max-width: 700px;

    h2 {
      margin-bottom: 20px;
    }
  }

  .order-row {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 17px 20px;
    margin-top: 12px;
    gap: 15px;
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
    margin-top: 24px;
  }
}
</style>

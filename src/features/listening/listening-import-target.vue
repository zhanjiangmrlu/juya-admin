<script setup lang="ts">
import { ref } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { listeningRequest } from '@/services/listening-service'

import type { Article, Page } from './listening-types'

import { statusLabels } from './listening-model'

const mode = defineModel<'create' | 'update'>({ required: true })
defineProps<{
  target: Article | null
  targetRevision: number | null
  targetError: string
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [article: Article | null] }>()
const query = ref(''),
  rows = ref<Article[]>([]),
  page = ref(1),
  total = ref(0),
  busy = ref(false),
  error = ref(''),
  searched = ref(false)
/** 搜索真实已有文章，每页仅展示可明确选择的目标
 * @param nextPage 当前查询的目标页，默认重新搜索第一页
 * @returns 已加载的当前页
 */
const search = async (nextPage = 1) => {
  busy.value = true
  error.value = ''
  try {
    const value = await listeningRequest<Page<Article>>(
      `/articles?q=${encodeURIComponent(query.value.trim())}&page=${nextPage}&limit=10`
    )
    rows.value = value.items
    total.value = value.total
    page.value = value.page
    searched.value = true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '目标文章读取失败'
  } finally {
    busy.value = false
  }
}
/** 选择时重新读取目标当前稿，固定该身份和版本而不写文章
 * @param id 管理员明确选择的稳定文章编号
 * @returns 已确认可编辑的目标
 */
const select = async (id: string) => {
  busy.value = true
  error.value = ''
  try {
    const article = await listeningRequest<Article>(`/articles/${encodeURIComponent(id)}`)
    if (article.status === 'deleted') throw new Error('目标已删除，请选择其他文章')
    emit('select', article)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '目标暂不可用，请重试'
  } finally {
    busy.value = false
  }
}
/** 切回新建仅取消本次候选目标，不修改已有文章 */
const create = () => {
  emit('select', null)
}
</script>
<template>
  <section class="import-target">
    <h3>本次保存方式</h3>
    <div class="row">
      <label
        ><input
          v-model="mode"
          type="radio"
          value="create"
          :disabled="disabled || busy"
          @change="create"
        />新建文章草稿</label
      ><label
        ><input
          v-model="mode"
          type="radio"
          value="update"
          :disabled="disabled || busy"
        />更新已有文章</label
      >
    </div>
    <template v-if="mode === 'update'">
      <p class="notice">
        明确选择已有文章后核对下方前后差异，暂存和下一步均不会改写文章；只有最终确认才更新该文章草稿
      </p>
      <div class="row">
        <label class="field"
          >按中英文标题查找<input
            v-model="query"
            aria-label="查找已有文章"
            :disabled="disabled || busy"
            @keyup.enter="search()" /></label
        ><button type="button" :disabled="disabled || busy" @click="search()">搜索目标</button>
      </div>
      <AppState :busy="busy" :error="error || targetError" @retry="search()" />
      <p v-if="target" class="selected-target">
        已选目标：{{ target.payload.title_zh || '标题待补充' }} / {{ target.payload.title_en }} ·
        {{ target.id }} · 草稿版本 {{ targetRevision
        }}<span v-if="target.revision !== targetRevision"
          >（当前已变更为{{ target.revision }}，请重新选择并核对）</span
        >
      </p>
      <p v-else class="muted">尚未选择更新目标，不能保存为更新</p>
      <ul v-if="rows.length" class="target-results">
        <li v-for="item in rows" :key="item.id">
          <span
            >{{ item.payload.title_zh || '标题待补充' }} / {{ item.payload.title_en }} ·
            {{ statusLabels[item.status] || item.status }} · {{ item.id }}</span
          ><button type="button" :disabled="disabled || busy" @click="select(item.id)">
            选择《{{ item.payload.title_zh || '标题待补充' }}》
          </button>
        </li>
      </ul>
      <p v-else-if="searched && !busy && !error" class="muted">没有匹配文章，请调整查询</p>
      <div v-if="total > 10" class="row">
        <button :disabled="disabled || busy || page === 1" @click="search(page - 1)">
          上一页目标</button
        ><span>第{{ page }}页，共{{ total }}篇</span
        ><button :disabled="disabled || busy || page * 10 >= total" @click="search(page + 1)">
          下一页目标
        </button>
      </div>
    </template>
  </section>
</template>
<style scoped lang="scss">
.import-target {
  margin-bottom: 24px;

  .field {
    flex: 1;
  }

  .target-results {
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }

  .selected-target {
    overflow-wrap: anywhere;
  }
}
</style>

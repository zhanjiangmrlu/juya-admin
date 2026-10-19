<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import SceneReader from '@/features/scenes/scene-reader.vue'
import SceneTitle from '@/features/scenes/scene-title.vue'
import { mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { CardView, SceneContent } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{ content: SceneContent; suggestedId?: string | null }>()
const emit = defineEmits<{ close: []; confirm: [card: CardView] }>()
const page = ref(1),
  totalPages = ref(0),
  total = ref(0)
const search = ref(props.content.name),
  rows = ref<CardView[]>([]),
  chosen = ref<CardView | null>(null),
  confirmed = ref(false),
  busy = ref(false),
  error = ref('')
let alive = true
/**
 * 按管理员填写的名称搜索，名称一致也不自动合并
 * @param targetPage 需要读取的搜索结果页码
 */
const find = async (targetPage = 1) => {
  busy.value = true
  error.value = ''
  try {
    const result = await api.request<components['schemas']['AdminCardPage']>(
      queryURL('/api/admin/v1/cards', { search: search.value, limit: 10, page: targetPage })
    )
    if (alive) {
      rows.value = result.items
      page.value = result.page
      totalPages.value = result.total_pages
      total.value = result.total
    }
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '暂未获取已有卡片'
  } finally {
    if (alive) busy.value = false
  }
}
/** 读取选定目标的最新候选以核对完整差异
 * @param id 管理员明确点选的已有卡片
 */
const select = async (id: string) => {
  busy.value = true
  error.value = ''
  confirmed.value = false
  try {
    const value = await api.request<CardView>(`/api/admin/v1/cards/${encodeURIComponent(id)}`)
    if (alive) chosen.value = value
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '目标已变化，请重新选择'
  } finally {
    if (alive) busy.value = false
  }
}
/** 取消当前目标并重新选择，旧确认失效 */
const reset = () => {
  chosen.value = null
  confirmed.value = false
}
onBeforeUnmount(() => {
  alive = false
})
</script>
<template>
  <ElDialog
    :model-value="true"
    title="确认更新目标与差异"
    width="860px"
    align-center
    :close-on-click-modal="false"
    @close="emit('close')"
  >
    <p class="notice">更新只保存到目标卡片的候选稿，发布前不会改变学习端内容和学习成绩。</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <template v-if="!chosen">
      <form class="row target-search" @submit.prevent="find(1)">
        <input v-model="search" aria-label="搜索更新目标" placeholder="搜索中文或英文标题" /><button
          :disabled="busy"
          type="submit"
        >
          查找卡片
        </button>
      </form>
      <button
        v-if="suggestedId"
        type="button"
        class="text"
        :disabled="busy"
        @click="select(suggestedId)"
      >
        核对此资料已有的对应卡片
      </button>
      <div v-for="card in rows" :key="card.id" class="target-row">
        <img
          v-if="card.display_thumbnail_id"
          :src="mediaURL(card.display_thumbnail_id)"
          alt="目标缩略图"
        /><span
          ><SceneTitle
            :name="card.display_name || card.content.name"
            :title-en="card.display_title_en" /></span
        ><button type="button" :disabled="busy" @click="select(card.id)">选择并核对差异</button>
      </div>
      <div v-if="total" class="row">
        <span>共{{ total }}条 · 第{{ page }}/{{ totalPages }}页</span
        ><button :disabled="busy || page <= 1" @click="find(page - 1)">上一页</button
        ><button :disabled="busy || page >= totalPages" @click="find(page + 1)">下一页</button>
      </div>
      <p v-if="!rows.length" class="small muted">
        请输入名称查找，再明确选择更新目标；同名不代表同一张卡片。
      </p>
    </template>
    <template v-else>
      <div class="between target-search">
        <strong
          >将更新：<SceneTitle
            :name="chosen.content.name"
            :title-en="chosen.content.title_en" /></strong
        ><button type="button" @click="reset">重新选择</button>
      </div>
      <div class="comparison">
        <section>
          <h3>目标当前候选稿</h3>
          <SceneReader :content="chosen.content" />
        </section>
        <section>
          <h3>本次将保存的导入资料</h3>
          <SceneReader :content="content" />
        </section>
      </div>
      <label class="confirm-target"
        ><input
          v-model="confirmed"
          type="checkbox"
        />我已核对名称、素材与正文差异，确认更新这张卡片的草稿</label
      >
    </template>
    <template #footer
      ><button type="button" @click="emit('close')">取消</button
      ><button
        type="button"
        class="primary"
        :disabled="busy || !chosen || !confirmed"
        @click="chosen && emit('confirm', chosen)"
      >
        确认更新此草稿
      </button></template
    >
  </ElDialog>
</template>
<style scoped lang="scss">
.target-search {
  margin: 20px 0;

  input {
    flex: 1;
  }
}

.target-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);

  img {
    width: 48px;
    height: 55px;
    object-fit: cover;
  }

  span {
    flex: 1;
  }
}

.comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  max-height: 55vh;
  overflow: auto;

  section {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  h3 {
    font-size: 13px;
    padding: 14px;
    background: var(--soft);
  }
}

.confirm-target {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-top: 22px;
}
</style>

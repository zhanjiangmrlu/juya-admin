<script setup lang="ts">
import { onMounted, ref } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText } from '@/services/display'
import { listeningRequest } from '@/services/listening-service'

import type { components } from '@/shared/contracts/generated/admin-api'

const props = defineProps<{ userId: string }>(),
  page = ref(1)
const records = useResource(() =>
  listeningRequest<components['schemas']['Page_Summary_']>(
    `/users/${props.userId}/records?page=${page.value}&limit=20`
  )
)
/** 切换听读已学记录页并读取实际集合
 * @param direction 前一页为-1，后一页为1
 */
const changePage = (direction: number) => {
  page.value += direction
  void records.refresh()
}
onMounted(records.refresh)
</script>
<template>
  <section class="article-records">
    <AppState
      :busy="records.busy.value"
      :error="records.error.value"
      :empty="records.data.value?.total === 0"
      empty-title="用户尚未完成听读文章"
      empty-text="仅展示真实完成记录，历史累计保留"
      @retry="records.refresh"
    />
    <div v-if="records.data.value" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>听读文章</th>
            <th>首次完成 / 最近完成</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records.data.value.items" :key="item.id">
            <td>
              <div class="article-title">
                <img v-if="item.thumbnail_url" :src="item.thumbnail_url" alt="" /><span
                  v-else
                  class="image-placeholder"
                  >暂无配图</span
                ><span
                  ><strong>{{ item.title_zh }}</strong>
                  <p>{{ item.title_en }}</p>
                  <small>{{ item.word_count }} 词</small></span
                >
              </div>
            </td>
            <td>
              <p>首次：{{ dateText(item.first_completed_at) }}</p>
              <p>最近：{{ dateText(item.last_completed_at) }}</p>
            </td>
            <td>
              <RouterLink v-if="item.available" :to="`/listening/${item.id}`"
                >查看文章管理</RouterLink
              ><span v-else>暂不可用 · 成绩保留</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pagination">
        <span>共 {{ records.data.value.total }} 篇</span
        ><button :disabled="page <= 1 || records.busy.value" @click="changePage(-1)">上一页</button
        ><span>第 {{ page }} 页</span
        ><button
          :disabled="page * 20 >= records.data.value.total || records.busy.value"
          @click="changePage(1)"
        >
          下一页
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped lang="scss">
.article-records {
  .article-title {
    display: flex;
    align-items: center;
    gap: 16px;

    img,
    .image-placeholder {
      flex-shrink: 0;
      width: 48px;
      height: 72px;
      object-fit: contain;
    }

    .image-placeholder {
      display: grid;
      place-items: center;
      background: var(--soft);
      font-size: 11px;
    }

    p,
    small {
      color: var(--muted);
    }
  }
}
</style>

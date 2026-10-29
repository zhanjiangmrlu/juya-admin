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
            <th>状态／首次完成／最近学习</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records.data.value.items" :key="item.id">
            <td>
              <div class="article-title">
                <strong>{{ item.title_zh }}</strong>
                <p>{{ item.title_en }}</p>
              </div>
            </td>
            <td>
              <span class="badge" :class="{ offline: !item.available }">{{
                item.available ? '已发布' : '暂不可用'
              }}</span>
              <p>首次完成：{{ dateText(item.first_completed_at) }}</p>
              <p>最近学习：{{ dateText(item.last_completed_at) }}</p>
            </td>
            <td>
              <RouterLink v-if="item.available" :to="`/listening/${item.id}/published-preview`"
                >查看发布内容</RouterLink
              ><span v-else>暂不可用 · 成绩保留</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="records.data.value.total > 20" class="pagination">
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
  table {
    table-layout: fixed;

    th:first-child {
      width: 42%;
    }

    th:nth-child(2) {
      width: 40%;
    }

    th:last-child {
      width: 18%;
    }
  }

  td {
    padding-top: 20px;
    padding-bottom: 20px;
    font-size: 12px;
  }

  td > p {
    font-size: 11px;
    margin-top: 4px;
    color: var(--muted);
  }

  .article-title {
    p {
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
    }
  }
}
</style>

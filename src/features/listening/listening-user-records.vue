<script setup lang="ts">
import { ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus'
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
 * @param value 管理员选择的听读记录页码
 */
const changePage = (value: number) => {
  page.value = value
  void records.refresh()
}
onMounted(records.refresh)
</script>
<template>
  <section class="article-records">
    <AppState
      element-plus
      :busy="records.busy.value"
      :error="records.error.value"
      :empty="records.data.value?.total === 0"
      empty-title="用户尚未完成听读文章"
      empty-text="仅展示真实完成记录，历史累计保留"
      @retry="records.refresh"
    />
    <div v-if="records.data.value" class="table-wrap">
      <ElTable :data="records.data.value.items" row-key="id">
        <ElTableColumn label="听读文章" :min-width="357"
          ><template #default="{ row: item }"
            ><div class="article-title">
              <strong>{{ item.title_zh }}</strong>
              <p>{{ item.title_en }}</p>
            </div></template
          ></ElTableColumn
        >
        <ElTableColumn label="状态／首次完成／最近学习" :min-width="340"
          ><template #default="{ row: item }"
            ><ElTag :type="item.available ? 'success' : 'info'" size="small">{{
              item.available ? '已发布' : '暂不可用'
            }}</ElTag>
            <p>首次完成：{{ dateText(item.first_completed_at) }}</p>
            <p>最近学习：{{ dateText(item.last_completed_at) }}</p></template
          ></ElTableColumn
        >
        <ElTableColumn label="操作" :min-width="153"
          ><template #default="{ row: item }"
            ><RouterLink v-if="item.available" :to="`/listening/${item.id}/published-preview`"
              >查看发布内容</RouterLink
            ><span v-else>暂不可用 · 成绩保留</span></template
          ></ElTableColumn
        >
      </ElTable>
      <ElPagination
        v-if="records.data.value.total > 20"
        class="records-pagination"
        :current-page="page"
        :page-size="20"
        :total="records.data.value.total"
        :disabled="records.busy.value"
        layout="total, prev, pager, next"
        prev-text="上一页"
        next-text="下一页"
        @current-change="changePage"
      />
    </div>
  </section>
</template>
<style scoped lang="scss">
.article-records {
  :deep(td[class~='el-table__cell']) {
    padding-top: 20px;
    padding-bottom: 20px;
    font-size: 12px;
  }

  :deep(.cell > p) {
    font-size: 11px;
    margin-top: 4px;
    color: var(--muted);
  }

  .article-title p {
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
  }

  .records-pagination {
    justify-content: flex-end;
    padding: 16px 20px;
  }
}
</style>

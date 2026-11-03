<script setup lang="ts">
import {
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElPagination,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs,
  ElTag
} from 'element-plus'
import { onMounted, ref } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import ListeningUserRecords from '@/features/listening/listening-user-records.vue'
import SceneTitle from '@/features/scenes/scene-title.vue'
import { dateText, mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'
import { listeningRequest } from '@/services/listening-service'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ preview: [cardId: string] }>()
const tab = ref<'learned' | 'listening' | 'checkins'>('learned'),
  page = ref(1),
  checkinPage = ref(1),
  expanded = ref(''),
  dayBusy = ref(false),
  dayError = ref(''),
  day = ref<components['schemas']['DailyRecords'] | null>(null)
const articleDay = ref<{
    article_items: (components['schemas']['Summary'] & { completed_at: string })[]
    article_count: number
  } | null>(null),
  articleDayError = ref('')
const learned = useResource(() =>
  api.request<components['schemas']['Page_LearningRecord_']>(
    queryURL(`/api/admin/v1/users/${props.userId}/learning-records`, {
      page: page.value,
      limit: 20
    })
  )
)
const checkins = useResource(() =>
  api.request<components['schemas']['Page_CheckinRecord_']>(
    queryURL(`/api/admin/v1/users/${props.userId}/checkins`, { page: checkinPage.value, limit: 20 })
  )
)
/** 分别保留两个记录标签的加载状态
 * @param value 目标标签
 */
const switchTab = (value: string | number) => {
  if (value !== 'learned' && value !== 'listening' && value !== 'checkins') return
  tab.value = value
  if (value === 'checkins' && !checkins.data.value) void checkins.refresh()
}
/** 展开真实当日学习来源，过期响应不覆盖新日期
 * @param date 北京时间打卡日期
 */
const expand = async (date: string) => {
  if (expanded.value === date && !dayError.value) {
    expanded.value = ''
    return
  }
  expanded.value = date
  dayBusy.value = true
  dayError.value = ''
  day.value = null
  articleDay.value = null
  articleDayError.value = ''
  try {
    const result = await api.request<components['schemas']['DailyRecords']>(
      `/api/admin/v1/users/${props.userId}/checkins/${date}`
    )
    if (expanded.value === date) day.value = result
    try {
      const listening = await listeningRequest<{
        article_items: (components['schemas']['Summary'] & { completed_at: string })[]
        article_count: number
      }>(`/users/${props.userId}/checkins/${date}`)
      if (expanded.value === date) articleDay.value = listening
    } catch (reason) {
      if (expanded.value === date)
        articleDayError.value = reason instanceof Error ? reason.message : '听读明细暂未获取'
    }
  } catch (reason) {
    if (expanded.value === date)
      dayError.value = reason instanceof Error ? reason.message : '暂未获取'
  } finally {
    if (expanded.value === date) dayBusy.value = false
  }
}
/** 响应单项手风琴切换，关闭时让正在返回的明细失效
 * @param value 当前展开的北京时间日期，空字符串代表全部关闭
 */
const changeDay = (value: string | number | (string | number)[]) => {
  if (!value || Array.isArray(value)) {
    expanded.value = ''
    return
  }
  void expand(String(value))
}
/** 切换场景学习记录并读取所选页
 * @param value 管理员选择的场景记录页码
 */
const changeLearnedPage = (value: number) => {
  page.value = value
  void learned.refresh()
}
/** 切换打卡记录并读取所选页
 * @param value 管理员选择的打卡记录页码
 */
const changeCheckinPage = (value: number) => {
  checkinPage.value = value
  void checkins.refresh()
}
onMounted(() => {
  void learned.refresh()
})
</script>
<template>
  <section class="panel learning-records">
    <h2>学习记录</h2>
    <ElTabs :model-value="tab" @tab-change="switchTab">
      <ElTabPane :label="`已学场景 ${learned.data.value?.total ?? ''}`" name="learned">
        <AppState
          element-plus
          :busy="learned.busy.value"
          :error="learned.error.value"
          :empty="learned.data.value?.total === 0"
          empty-title="用户还没有学习记录"
          empty-text="用户主动完成学习后，这里会显示真实记录"
          @retry="learned.refresh"
        />
        <div v-if="learned.data.value && !learned.busy.value" class="table-wrap">
          <ElTable :data="learned.data.value.items" row-key="id">
            <ElTableColumn label="场景卡片" :min-width="349"
              ><template #default="{ row: card }"
                ><div class="learned-card">
                  <img
                    v-if="card.thumbnail_id"
                    :src="mediaURL(card.thumbnail_id)"
                    alt=""
                  /><SceneTitle
                    :name="card.name"
                    :title-en="card.title_en"
                    :show-missing="false"
                  /></div></template
            ></ElTableColumn>
            <ElTableColumn label="状态／首次完成／最近学习" :min-width="314"
              ><template #default="{ row: card }"
                ><ElTag :type="card.available ? 'success' : 'info'" size="small">{{
                  card.available
                    ? '已发布'
                    : card.unavailable_reason === 'deleted'
                      ? '已删除'
                      : '已下线'
                }}</ElTag>
                <p>首次：{{ dateText(card.first_completed_at) }}</p>
                <p>最近：{{ dateText(card.last_completed_at) }}</p></template
              ></ElTableColumn
            >
            <ElTableColumn label="操作" :min-width="187"
              ><template #default="{ row: card }"
                ><ElButton
                  v-if="card.available"
                  link
                  type="primary"
                  @click="emit('preview', card.id)"
                  >查看发布内容</ElButton
                ><span v-else class="muted small">成绩保留</span></template
              ></ElTableColumn
            >
          </ElTable>
          <ElPagination
            v-if="learned.data.value.total > 20"
            class="records-pagination"
            :current-page="page"
            :page-size="20"
            :total="learned.data.value.total"
            :disabled="learned.busy.value"
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            @current-change="changeLearnedPage"
          />
        </div>
      </ElTabPane>
      <ElTabPane label="已学听读" name="listening"
        ><ListeningUserRecords v-if="tab === 'listening'" :user-id="userId"
      /></ElTabPane>
      <ElTabPane :label="`打卡记录 ${checkins.data.value?.total ?? ''}`" name="checkins">
        <AppState
          element-plus
          :busy="checkins.busy.value"
          :error="checkins.error.value"
          :empty="checkins.data.value?.total === 0"
          empty-title="用户还没有打卡记录"
          empty-text="主动完成一张场景卡或一篇听读会自动计入当天打卡"
          @retry="checkins.refresh"
        />
        <div v-if="checkins.data.value">
          <ElCollapse :model-value="expanded" accordion @change="changeDay">
            <ElCollapseItem
              v-for="record in checkins.data.value.items"
              :key="record.date"
              :name="record.date"
              class="checkin"
            >
              <template #title
                ><div class="checkin-heading">
                  <strong>{{ record.date }}</strong
                  ><span
                    >完成 {{ record.card_count }} 张场景卡 ·
                    {{ record.article_count ?? '暂未获取' }} 篇听读</span
                  >
                </div></template
              >
              <div v-if="expanded === record.date" class="day-cards">
                <AppState
                  element-plus
                  :busy="dayBusy"
                  :error="dayError"
                  @retry="expand(record.date)"
                />
                <div v-for="card in day?.items" :key="card.id" class="between day-card">
                  <div>
                    <SceneTitle
                      :name="card.name"
                      :title-en="card.title_en"
                      :show-missing="false"
                    /><small class="muted">{{ dateText(card.completed_at) }}</small>
                  </div>
                  <ElButton
                    v-if="card.available"
                    link
                    type="primary"
                    @click="emit('preview', card.id)"
                  >
                    查看发布版</ElButton
                  ><span v-else class="muted">{{
                    card.unavailable_reason === 'deleted'
                      ? '已删除 · 成绩保留'
                      : '暂不可用 · 成绩保留'
                  }}</span>
                </div>
                <p v-if="articleDayError" class="notice error" role="alert">
                  {{ articleDayError }}
                </p>
                <div
                  v-for="item in articleDay?.article_items"
                  :key="`listening-${item.id}`"
                  class="between day-card"
                >
                  <div>
                    <strong>{{ item.title_zh }}</strong>
                    <p>{{ item.title_en }}</p>
                    <small class="muted">{{ dateText(item.completed_at) }} · 听读</small>
                  </div>
                  <RouterLink v-if="item.available" :to="`/listening/${item.id}/published-preview`"
                    >查看发布内容</RouterLink
                  ><span v-else class="muted">暂不可用 · 成绩保留</span>
                </div>
              </div>
            </ElCollapseItem>
          </ElCollapse>
          <ElPagination
            v-if="checkins.data.value.total > 20"
            class="records-pagination"
            :current-page="checkinPage"
            :page-size="20"
            :total="checkins.data.value.total"
            :disabled="checkins.busy.value"
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            @current-change="changeCheckinPage"
          />
        </div>
      </ElTabPane>
    </ElTabs>
    <p class="records-note">后台查看内容为只读预览，不代用户完成、收藏或打卡。</p>
  </section>
</template>
<style scoped lang="scss">
.learning-records {
  padding: 24px;

  h2 {
    margin-bottom: 18px;
  }

  .records-note {
    margin-top: 12px;
    font-size: 11px;
    color: var(--muted);
  }

  .records-pagination {
    justify-content: flex-end;
    padding: 16px 20px;
  }

  :deep([class~='el-tabs__item']) {
    font-size: 12px;
  }

  :deep(td[class~='el-table__cell']) {
    font-size: 13px;
    padding-top: 22px;
    padding-bottom: 22px;
  }

  :deep(.cell > p) {
    font-size: 12px;
    margin-top: 4px;
  }

  .learned-card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;

    img {
      width: 48px;
      height: 72px;
      object-fit: contain;
      flex-shrink: 0;
    }
  }

  :deep(.el-collapse) {
    border: 0;
  }

  :deep([class~='el-collapse-item__header']) {
    min-height: 60px;
    height: auto;
    border: 0;
  }

  :deep([class~='el-collapse-item__wrap']) {
    border: 0;
  }

  :deep([class~='el-collapse-item__content']) {
    padding-bottom: 0;
  }

  .checkin-heading span {
    font-size: 12px;
    color: var(--muted);
  }

  .checkin {
    padding: 0 20px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
    margin-top: 12px;

    .checkin-heading {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 18px 0;
      gap: 8px;
    }

    .day-cards {
      padding: 0 18px 18px;
      background: var(--soft);
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .day-card {
      padding-top: 14px;
      font-size: 13px;
    }
  }
}
</style>

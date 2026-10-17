<script setup lang="ts">
import { onMounted, ref } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText, queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ preview: [cardId: string] }>()
const tab = ref<'learned' | 'checkins'>('learned'),
  page = ref(1),
  checkinPage = ref(1),
  expanded = ref(''),
  dayBusy = ref(false),
  dayError = ref(''),
  day = ref<components['schemas']['DailyRecords'] | null>(null)
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
const switchTab = (value: 'learned' | 'checkins') => {
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
  try {
    const result = await api.request<components['schemas']['DailyRecords']>(
      `/api/admin/v1/users/${props.userId}/checkins/${date}`
    )
    if (expanded.value === date) day.value = result
  } catch (reason) {
    if (expanded.value === date)
      dayError.value = reason instanceof Error ? reason.message : '暂未获取'
  } finally {
    if (expanded.value === date) dayBusy.value = false
  }
}
onMounted(() => {
  void learned.refresh()
})
</script>
<template>
  <section class="panel">
    <div class="tabs">
      <button type="button" :class="{ active: tab === 'learned' }" @click="switchTab('learned')">
        已学卡片</button
      ><button type="button" :class="{ active: tab === 'checkins' }" @click="switchTab('checkins')">
        打卡记录
      </button>
    </div>
    <div v-show="tab === 'learned'">
      <AppState
        :busy="learned.busy.value"
        :error="learned.error.value"
        :empty="learned.data.value?.total === 0"
        empty-title="用户还没有学习记录"
        empty-text="用户主动完成学习后，这里会显示真实记录"
        @retry="learned.refresh"
      />
      <div v-if="learned.data.value && !learned.busy.value" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>场景卡片</th>
              <th>首次完成</th>
              <th>最近学习</th>
              <th>可用状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in learned.data.value.items" :key="card.id">
              <td>
                <strong>{{ card.name }}</strong>
              </td>
              <td>{{ dateText(card.first_completed_at) }}</td>
              <td>{{ dateText(card.last_completed_at) }}</td>
              <td>
                {{
                  card.available
                    ? '可学习'
                    : card.unavailable_reason === 'deleted'
                      ? '已删除'
                      : '暂不可用'
                }}
              </td>
              <td>
                <button
                  v-if="card.available"
                  type="button"
                  class="text"
                  @click="emit('preview', card.id)"
                >
                  查看当前发布版</button
                ><span v-else class="muted small">成绩保留</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="learned.data.value.total > 20" class="pagination">
          <button
            :disabled="page <= 1"
            @click="
              () => {
                page--
                learned.refresh()
              }
            "
          >
            上一页</button
          ><span>第 {{ page }} 页</span
          ><button
            :disabled="page * 20 >= learned.data.value.total"
            @click="
              () => {
                page++
                learned.refresh()
              }
            "
          >
            下一页
          </button>
        </div>
      </div>
    </div>
    <div v-show="tab === 'checkins'">
      <AppState
        :busy="checkins.busy.value"
        :error="checkins.error.value"
        :empty="checkins.data.value?.total === 0"
        empty-title="用户还没有打卡记录"
        empty-text="主动完成一张卡片会自动计入当天打卡"
        @retry="checkins.refresh"
      />
      <div v-if="checkins.data.value">
        <div v-for="record in checkins.data.value.items" :key="record.date" class="checkin">
          <button type="button" class="checkin-heading" @click="expand(record.date)">
            <strong>{{ record.date }}</strong
            ><span
              >完成 {{ record.card_count }} 张场景卡
              {{ expanded === record.date ? '⌃' : '⌄' }}</span
            >
          </button>
          <div v-if="expanded === record.date" class="day-cards">
            <AppState :busy="dayBusy" :error="dayError" @retry="expand(record.date)" />
            <div v-for="card in day?.items" :key="card.id" class="between day-card">
              <div>
                {{ card.name }}<small class="muted"> · {{ dateText(card.completed_at) }}</small>
              </div>
              <button
                v-if="card.available"
                type="button"
                class="text"
                @click="emit('preview', card.id)"
              >
                查看发布版</button
              ><span v-else class="muted">{{
                card.unavailable_reason === 'deleted' ? '已删除 · 成绩保留' : '暂不可用 · 成绩保留'
              }}</span>
            </div>
          </div>
        </div>
        <div v-if="checkins.data.value.total > 20" class="pagination">
          <button
            :disabled="checkinPage <= 1"
            @click="
              () => {
                checkinPage--
                checkins.refresh()
              }
            "
          >
            上一页</button
          ><span>第 {{ checkinPage }} 页</span
          ><button
            :disabled="checkinPage * 20 >= checkins.data.value.total"
            @click="
              () => {
                checkinPage++
                checkins.refresh()
              }
            "
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped lang="scss">
.checkin {
  border-bottom: 1px solid var(--line);

  .checkin-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 18px 0;
    background: none;
    text-align: left;

    span {
      font-size: 12px;
      color: var(--muted);
    }
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
</style>

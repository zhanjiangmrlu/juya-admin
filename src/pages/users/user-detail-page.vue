<script setup lang="ts">
import { ElCard, ElDescriptions, ElDescriptionsItem, ElStatistic, ElTag } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import UserAuthorization from '@/features/learning-access/user-authorization.vue'
import UserAuthorizationHistory from '@/features/learning-access/user-authorization-history.vue'
import ScenePreview from '@/features/scenes/scene-preview.vue'
import UserLearningRecords from '@/features/users/user-learning-records.vue'
import { dateText, mediaURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
const route = useRoute(),
  userId = String(route.params.id)
const { data, busy, error, refresh } = useResource(() =>
  api.request<components['schemas']['AdminUser']>(`/api/admin/v1/users/${userId}`)
)
const preview = ref<components['schemas']['PublishedPreview'] | null>(null),
  previewError = ref('')
const metrics = computed(() =>
  data.value
    ? [
        { label: '已学场景卡', value: data.value.statistics.completed_cards, unit: '张' },
        { label: '已学听读', value: data.value.statistics.completed_articles, unit: '篇' },
        { label: '连续打卡', value: data.value.statistics.current_streak, unit: '天' },
        { label: '累计打卡', value: data.value.statistics.total_checkin_days, unit: '天' }
      ]
    : []
)
/** 滚动到授权变更审计表
 * @returns 滚动完成后无返回值
 */
const showAuthorizationHistory = () =>
  document
    .getElementById('authorization-history')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
/** 读取卡片当前发布快照，历史停用卡不开放正文
 * @param cardId 用户记录中的稳定卡片编号
 */
const showPreview = async (cardId: string) => {
  previewError.value = ''
  try {
    preview.value = await api.request(`/api/admin/v1/cards/${cardId}/published`)
  } catch (reason) {
    previewError.value = reason instanceof Error ? reason.message : '暂时无法预览'
  }
}
onMounted(() => {
  void refresh()
})
</script>
<template>
  <div class="user-detail-page management-page">
    <div class="page-heading between">
      <div>
        <h1>{{ data?.nickname || '学习者' }} · 用户详情</h1>
        <p>账号资料与学习数据只读，学习授权可管理。</p>
      </div>
      <RouterLink :to="String(route.query.back || '/users')" class="button-link"
        >返回用户列表</RouterLink
      >
    </div>
    <AppState element-plus :busy="busy" :error="error" @retry="refresh" />
    <template v-if="data && !busy">
      <UserAuthorization
        v-if="data.authorization"
        :user-id="userId"
        :user-code="data.user_code"
        :authorization="data.authorization"
        @changed="refresh"
        @history-requested="showAuthorizationHistory"
      />
      <div class="profile-overview">
        <ElCard shadow="never" class="account-panel">
          <h2>账号资料</h2>
          <div class="profile-heading">
            <img v-if="data.avatar_id" :src="mediaURL(data.avatar_id)" class="avatar" alt="" /><span
              v-else
              class="avatar"
              ><AppIcon name="user" :size="17" /></span
            ><strong>{{ data.nickname || '学习者' }}</strong>
          </div>
          <ElDescriptions :column="1" class="profile-fields">
            <ElDescriptionsItem label="用户编号">{{ data.user_code }}</ElDescriptionsItem>
            <ElDescriptionsItem label="注册时间">{{
              dateText(data.registered_at)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="登录方式">微信身份登录</ElDescriptionsItem>
            <ElDescriptionsItem label="最近登录">{{
              dateText(data.last_login_at)
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="最近学习">{{
              dateText(data.statistics.last_studied_at)
            }}</ElDescriptionsItem>
          </ElDescriptions>
        </ElCard>
        <ElCard shadow="never" class="learning-panel">
          <h2>总学习数据</h2>
          <div class="user-metrics">
            <div v-for="metric in metrics" :key="metric.label">
              <ElStatistic v-if="metric.value != null" :title="metric.label" :value="metric.value"
                ><template #suffix>{{ metric.unit }}</template></ElStatistic
              >
              <div v-else class="missing-metric">
                <span>{{ metric.label }}</span
                ><strong>暂未获取</strong>
              </div>
            </div>
          </div>
          <ElDescriptions :column="1" class="profile-fields learning-fields">
            <ElDescriptionsItem label="今日状态">
              <ElTag
                :type="data.statistics.checked_in_today ? 'success' : 'warning'"
                size="small"
                >{{ data.statistics.checked_in_today ? '今日已打卡' : '今日待打卡' }}</ElTag
              >
            </ElDescriptionsItem>
            <ElDescriptionsItem label="收藏数量">
              场景 {{ data.statistics.favorite_count ?? '暂未获取' }} 张／听读
              {{ data.statistics.listening_favorite_count ?? '暂未获取' }} 篇
            </ElDescriptionsItem>
            <ElDescriptionsItem label="最长连续"
              >{{ data.statistics.longest_streak ?? '暂未获取' }} 天</ElDescriptionsItem
            >
          </ElDescriptions>
          <p class="profile-note">场景与听读分别累计，共用每日打卡，不手工改写成绩。</p>
        </ElCard>
      </div>
      <p v-if="previewError" class="notice error" role="alert">{{ previewError }}</p>
      <UserLearningRecords :user-id="userId" @preview="showPreview" />
      <UserAuthorizationHistory
        v-if="data.authorization"
        :user-id="userId"
        :revision="data.authorization.revision"
      />
    </template>
    <ScenePreview
      v-if="preview"
      :content="preview.content"
      :pronunciation="{ cardId: preview.card_id, reference: { version_id: preview.version_id } }"
      mode="published"
      @close="preview = null"
    />
  </div>
</template>
<style scoped lang="scss">
.profile-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  margin-bottom: 24px;

  .el-card {
    min-height: 480px;
    border-radius: 14px;

    :deep([class~='el-card__body']) {
      padding: 24px;
    }
  }

  h2 {
    font-size: 18px;
    line-height: 28px;
  }
}

.profile-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 20px 0;
  font-size: 14px;

  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--soft);
    object-fit: cover;
  }
}

.profile-fields {
  font-size: 12px;

  :deep([class~='el-descriptions__cell']) {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
  }

  :deep([class~='el-descriptions__label']) {
    font-size: 12px;
    line-height: 1.72;
    color: var(--ink);
    flex-shrink: 0;
    width: 104px;
    margin-right: 0;
  }

  :deep([class~='el-descriptions__content']) {
    font-size: 12px;
    line-height: 1.72;
    color: var(--muted);
    text-align: right;
    overflow-wrap: anywhere;
  }

  :deep(.el-tag) {
    font-size: 10px;
    font-weight: 400;
    padding: 2px 6px;
  }
}

.user-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 26px 20px;
  margin: 18px 0 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);

  > div {
    min-width: 0;
  }

  :deep([class~='el-statistic__head']),
  .missing-metric span {
    font-size: 11px;
    color: var(--muted);
  }

  :deep([class~='el-statistic__content']),
  .missing-metric strong {
    display: block;
    font-size: 28px;
    font-weight: 500;
    line-height: 1.4;
    margin-top: 9px;
  }

  :deep([class~='el-statistic__suffix']) {
    font-size: 12px;
    font-weight: 400;
    margin-left: 3px;
  }
}

.learning-panel {
  > p {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.8;
  }

  .statistics-date {
    font-size: 12px;
    margin-top: 24px;
  }
}

@media (width <= 1050px) {
  .profile-overview {
    grid-template-columns: 1fr;
  }
}

.profile-note {
  margin-top: 10px;
  font-size: 11px;
  color: var(--muted);
}

.learning-fields {
  margin-top: 20px;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import UserAuthorization from '@/features/learning-access/user-authorization.vue'
import UserAuthorizationHistory from '@/features/learning-access/user-authorization-history.vue'
import ScenePreview from '@/features/scenes/scene-preview.vue'
import UserLearningRecords from '@/features/users/user-learning-records.vue'
import { contactSourceText, dateText, mediaURL } from '@/services/display'
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
  <div class="user-detail-page">
    <div class="page-heading between">
      <div>
        <h1>{{ data?.nickname || '学习者' }} · 用户详情</h1>
        <p>账号资料与学习数据只读，学习授权可管理。</p>
      </div>
      <RouterLink :to="String(route.query.back || '/users')" class="button-link"
        >返回用户列表</RouterLink
      >
    </div>
    <AppState :busy="busy" :error="error" @retry="refresh" />
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
        <section class="panel account-panel">
          <h2>账号资料</h2>
          <div class="profile-heading">
            <img v-if="data.avatar_id" :src="mediaURL(data.avatar_id)" class="avatar" alt="" /><span
              v-else
              class="avatar"
              ><AppIcon name="user" :size="17" /></span
            ><strong>{{ data.nickname || '学习者' }}</strong>
          </div>
          <dl class="profile-fields">
            <div>
              <dt>用户编号</dt>
              <dd>{{ data.user_code }}</dd>
            </div>
            <div>
              <dt>注册时间</dt>
              <dd>{{ dateText(data.registered_at) }}</dd>
            </div>
            <div>
              <dt>手机号</dt>
              <dd>
                {{ data.phone || '未填写' }}
                <small v-if="data.phone" class="badge draft">{{
                  contactSourceText(data.phone_source)
                }}</small>
              </dd>
            </div>
            <div>
              <dt>微信号</dt>
              <dd>
                {{ data.wechat_contact || '未填写' }}
                <small v-if="data.wechat_contact" class="badge draft">{{
                  contactSourceText(data.wechat_source)
                }}</small>
              </dd>
            </div>
            <div>
              <dt>登录方式</dt>
              <dd>微信身份登录</dd>
            </div>
            <div>
              <dt>最近登录</dt>
              <dd>{{ dateText(data.last_login_at) }}</dd>
            </div>
            <div>
              <dt>最近学习</dt>
              <dd>{{ dateText(data.statistics.last_studied_at) }}</dd>
            </div>
          </dl>
          <p class="profile-note">已填联系资料及其来源在此只读保留，不能代用户编辑。</p>
        </section>
        <section class="panel learning-panel">
          <h2>总学习数据</h2>
          <div class="user-metrics">
            <div v-for="metric in metrics" :key="metric.label">
              <span>{{ metric.label }}</span>
              <strong
                >{{ metric.value ?? '暂未获取'
                }}<small v-if="metric.value != null">{{ metric.unit }}</small></strong
              >
            </div>
          </div>
          <dl class="profile-fields learning-fields">
            <div>
              <dt>今日状态</dt>
              <dd>
                <span class="badge" :class="{ draft: !data.statistics.checked_in_today }">{{
                  data.statistics.checked_in_today ? '今日已打卡' : '今日待打卡'
                }}</span>
              </dd>
            </div>
            <div>
              <dt>收藏数量</dt>
              <dd>
                场景 {{ data.statistics.favorite_count ?? '暂未获取' }} 张／听读
                {{ data.statistics.listening_favorite_count ?? '暂未获取' }} 篇
              </dd>
            </div>
            <div>
              <dt>最长连续</dt>
              <dd>{{ data.statistics.longest_streak ?? '暂未获取' }} 天</dd>
            </div>
          </dl>
          <p class="profile-note">场景与听读分别累计，共用每日打卡，不手工改写成绩。</p>
        </section>
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

  .panel {
    margin-bottom: 0;
    min-height: 480px;
    padding: 24px;
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
  display: grid;
  gap: 0;
  margin: 0;
  font-size: 12px;

  > div {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
    gap: 16px;
    align-items: baseline;
  }

  dt {
    color: var(--ink);
  }

  dd {
    margin: 0;
    color: var(--muted);
    text-align: right;
    overflow-wrap: anywhere;
  }

  small {
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

  strong {
    display: block;
    font-size: 28px;
    font-weight: 500;
    line-height: 1.4;
    margin-top: 9px;

    small {
      font-size: 12px;
      font-weight: 400;
      margin-left: 3px;
    }
  }

  span {
    font-size: 11px;
    color: var(--muted);
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

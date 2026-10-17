<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
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
        { label: '连续打卡', value: data.value.statistics.current_streak, unit: '天' },
        { label: '累计打卡', value: data.value.statistics.total_checkin_days, unit: '天' },
        { label: '最长连续', value: data.value.statistics.longest_streak, unit: '天' },
        { label: '当前收藏', value: data.value.statistics.favorite_count, unit: '张' }
      ]
    : []
)
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
  <div>
    <div class="page-heading">
      <RouterLink :to="String(route.query.back || '/users')" class="back-link"
        >‹ 返回用户列表</RouterLink
      >
      <div class="between">
        <h1>用户详情</h1>
        <button type="button" :disabled="busy" @click="refresh">刷新资料</button>
      </div>
    </div>
    <AppState :busy="busy" :error="error" @retry="refresh" /><template v-if="data && !busy"
      ><section class="panel">
        <div class="profile-heading">
          <img v-if="data.avatar_id" :src="mediaURL(data.avatar_id)" class="avatar" alt="" /><span
            v-else
            class="avatar"
            ><AppIcon :size="28"
          /></span>
          <div>
            <h2>{{ data.nickname || '学习者' }}</h2>
            <p class="muted small">{{ data.id }}</p>
          </div>
        </div>
        <dl class="profile-fields">
          <div>
            <dt>手机号</dt>
            <dd>{{ data.phone || '未填写' }}<small v-if="data.phone">用户填写／未验证</small></dd>
          </div>
          <div>
            <dt>微信号</dt>
            <dd>
              {{ data.wechat_contact || '未填写'
              }}<small v-if="data.wechat_contact">用户填写／未验证</small>
            </dd>
          </div>
          <div>
            <dt>注册时间</dt>
            <dd>{{ dateText(data.registered_at) }}</dd>
          </div>
          <div>
            <dt>最近登录</dt>
            <dd>{{ dateText(data.last_login_at) }}</dd>
          </div>
          <div>
            <dt>最近学习</dt>
            <dd>{{ dateText(data.statistics.last_studied_at) }}</dd>
          </div>
          <div>
            <dt>今日状态</dt>
            <dd>{{ data.statistics.checked_in_today ? '今日已打卡' : '今日待打卡' }}</dd>
          </div>
        </dl>
      </section>
      <section class="panel">
        <h2>学习概况</h2>
        <div class="user-metrics">
          <div v-for="metric in metrics" :key="metric.label">
            <strong
              >{{ metric.value }}<small>{{ metric.unit }}</small></strong
            ><span>{{ metric.label }}</span>
          </div>
        </div>
        <p class="muted small">
          统计日期：{{ data.statistics.date }}（北京时间） · 下线或删除卡片不减少已有学习成绩
        </p>
      </section>
      <p v-if="previewError" class="notice error" role="alert">{{ previewError }}</p>
      <UserLearningRecords :user-id="userId" @preview="showPreview" /></template
    ><ScenePreview
      v-if="preview"
      :content="preview.content"
      mode="published"
      @close="preview = null"
    />
  </div>
</template>
<style scoped lang="scss">
.back-link {
  display: block;
  font-size: 12px;
  margin-bottom: 16px;
}

.profile-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--soft);
    object-fit: cover;
  }
}

.profile-fields {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin: 0;

  div {
    min-width: 0;
  }

  dt {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;

    small {
      display: block;
      color: var(--muted);
      font-size: 11px;
    }
  }
}

.user-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin: 24px 0;

  > div {
    border-right: 1px solid var(--line);
    padding-left: 24px;

    &:first-child {
      padding-left: 0;
    }

    &:last-child {
      border: 0;
    }

    strong {
      display: block;
      font-size: 28px;
      font-weight: 650;

      small {
        font-size: 11px;
        font-weight: 400;
        margin-left: 4px;
      }
    }

    span {
      font-size: 12px;
      color: var(--muted);
    }
  }
}
</style>

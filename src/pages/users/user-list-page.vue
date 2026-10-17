<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { dateText, mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
defineOptions({ name: 'UserListPage' })
const route = useRoute(),
  router = useRouter(),
  search = ref(String(route.query.search || ''))
const registered = computed(() => String(route.query.registered || 'all')),
  checkin = computed(() => String(route.query.checkin || 'all')),
  page = computed(() => Number(route.query.page || 1))
const { data, busy, error, refresh } = useResource(() =>
  api.request<components['schemas']['AdminUserPage']>(
    queryURL('/api/admin/v1/users', {
      search: route.query.search || '',
      registered: registered.value,
      checkin: checkin.value,
      page: page.value,
      limit: 20
    })
  )
)
/** 独立应用注册和打卡筛选，保留来源
 * @returns 路由条件更新
 * @param values 本次条件变化
 */
const filter = (values: Record<string, string | number>) =>
  router.replace({ query: { ...route.query, ...values, page: values.page || 1 } })
watch(
  () => route.fullPath,
  () => {
    if (route.path === '/users') {
      search.value = String(route.query.search || '')
      void refresh()
    }
  }
)
onActivated(() => {
  void refresh()
})
</script>
<template>
  <div>
    <div class="page-heading">
      <RouterLink v-if="route.query.from === 'statistics'" to="/statistics" class="back-link"
        >‹ 返回数据统计</RouterLink
      >
      <h1>用户列表</h1>
      <p>只读查看用户资料与学习记录，无联系方式和零学习账号均正常展示</p>
    </div>
    <div class="panel">
      <form class="filters" @submit.prevent="filter({ search })">
        <input
          v-model="search"
          aria-label="搜索用户"
          placeholder="用户编号、昵称、微信号或手机号"
        /><button type="submit"><AppIcon name="search" :size="16" />搜索</button
        ><button type="button" class="text" :disabled="busy" @click="refresh">刷新</button>
      </form>
      <div class="registration-filter">
        <span>注册日期</span
        ><button
          type="button"
          :class="{ active: registered === 'all' }"
          @click="filter({ registered: 'all' })"
        >
          全部注册</button
        ><button
          type="button"
          :class="{ active: registered === 'today' }"
          @click="filter({ registered: 'today' })"
        >
          今日注册</button
        ><small>统计日期：{{ data?.statistical_date || '暂未获取' }}（北京时间）</small>
      </div>
      <div class="registration-filter">
        <span>打卡状态</span
        ><button
          v-for="item in [
            { value: 'all', label: '全部' },
            { value: 'checked', label: '今日已打卡' },
            { value: 'unchecked', label: '今日未打卡' }
          ]"
          :key="item.value"
          type="button"
          :class="{ active: checkin === item.value }"
          @click="filter({ checkin: item.value })"
        >
          {{ item.label }}
        </button>
      </div>
      <AppState
        :busy="busy"
        :error="error"
        :empty="data?.total === 0"
        empty-title="暂无符合条件的用户"
        empty-text="可调整筛选条件或清空搜索重试"
        @retry="refresh"
        ><button type="button" @click="filter({ search: '', registered: 'all', checkin: 'all' })">
          清空条件
        </button></AppState
      >
      <div v-if="data && data.total && !busy && !error" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>联系方式</th>
              <th>注册时间</th>
              <th>已学场景卡</th>
              <th>连续打卡</th>
              <th>累计打卡</th>
              <th>最近学习</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in data.items" :key="user.id">
              <td>
                <div class="row">
                  <img
                    v-if="user.avatar_id"
                    :src="mediaURL(user.avatar_id)"
                    class="avatar"
                    alt=""
                  />
                  <div v-else class="avatar default"><AppIcon :size="20" /></div>
                  <div>
                    <strong>{{ user.nickname || '学习者' }}</strong>
                    <p class="identifier">{{ user.id }}</p>
                  </div>
                </div>
              </td>
              <td>
                <template v-if="user.phone || user.wechat_contact"
                  ><p v-if="user.phone">手机：{{ user.phone }}</p>
                  <p v-if="user.wechat_contact">微信：{{ user.wechat_contact }}</p>
                  <small class="muted">用户填写／未验证</small></template
                ><span v-else class="muted">未填写</span>
              </td>
              <td>{{ dateText(user.registered_at) }}</td>
              <td>{{ user.statistics.completed_cards }} 张</td>
              <td>
                {{ user.statistics.current_streak }} 天
                <p class="small muted">
                  {{ user.statistics.checked_in_today ? '今日已打卡' : '今日待打卡' }}
                </p>
              </td>
              <td>{{ user.statistics.total_checkin_days }} 天</td>
              <td>{{ dateText(user.statistics.last_studied_at) }}</td>
              <td>
                <RouterLink :to="{ path: `/users/${user.id}`, query: { back: route.fullPath } }"
                  >查看详情</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data && data.total > 20" class="pagination">
        <span>共 {{ data.total }} 人</span
        ><button :disabled="page <= 1 || busy" @click="filter({ page: page - 1 })">上一页</button
        ><span>第 {{ page }} 页</span
        ><button :disabled="page * 20 >= data.total || busy" @click="filter({ page: page + 1 })">
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.back-link {
  display: block;
  font-size: 12px;
  margin-bottom: 12px;
}

.registration-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 20px;
  font-size: 12px;

  > span {
    color: var(--muted);
    margin-right: 4px;
  }

  button {
    font-size: 12px;
    min-height: 30px;
    padding: 5px 10px;

    &.active {
      background: var(--soft);
      border-color: #adc3a4;
      font-weight: 600;
    }
  }

  small {
    margin-left: auto;
    color: var(--muted);
  }
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;

  &.default {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--soft);
  }
}
</style>

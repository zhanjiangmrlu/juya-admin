<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import AppState from '@/components/app-state/app-state.vue'
import { useResource } from '@/composables/use-resource'
import { contactSourceText, dateText, mediaURL, queryURL } from '@/services/display'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
defineOptions({ name: 'UserListPage' })
const route = useRoute(),
  router = useRouter(),
  search = ref(String(route.query.search || ''))
const registered = computed(() => String(route.query.registered || 'all')),
  checkin = computed(() => String(route.query.checkin || 'all')),
  page = computed(() => Number(route.query.page || 1))
const { data, busy, error, refresh } = useResource(async () => {
  const requested = route.fullPath
  const value = await api.request<components['schemas']['AdminUserPage']>(
    queryURL('/api/admin/v1/users', {
      search: route.query.search || '',
      registered: registered.value,
      checkin: checkin.value,
      authorization_status: route.query.authorization_status || 'all',
      page: page.value,
      limit: 20
    })
  )
  if (route.path === '/users' && route.fullPath === requested && value.page !== page.value)
    await router.replace({ query: { ...route.query, page: value.page } })
  return value
})
let scrollTop = 0,
  active = true,
  activated = false,
  scrollGeneration = 0,
  lastQuery = route.fullPath
/** 只在同次激活、同条件列表渲染完成后恢复位置
 * @param top 此次列表查询需要恢复的滚动位置
 */
const refreshAt = async (top: number) => {
  const run = ++scrollGeneration,
    query = route.fullPath
  await refresh()
  await nextTick()
  if (active && route.path === '/users' && route.fullPath === query && run === scrollGeneration)
    window.scrollTo({ top })
}
/** 独立应用注册和打卡筛选，保留来源
 * @returns 路由条件更新
 * @param values 本次条件变化
 */
const filter = async (values: Record<string, string | number>) => {
  const before = route.fullPath
  await router.replace({ query: { ...route.query, ...values, page: values.page || 1 } })
  if (route.fullPath === before) {
    scrollTop = 0
    await refreshAt(0)
  }
}
/** 离开列表前保存位置，并让未完成恢复失效 */
const rememberScroll = () => {
  scrollTop = window.scrollY
  scrollGeneration++
}
/** 返回同条件列表时刷新真实数据并恢复阅读位置 */
const activate = async () => {
  active = true
  if (!activated) {
    activated = true
    return
  }
  if (lastQuery !== route.fullPath) scrollTop = 0
  lastQuery = route.fullPath
  search.value = String(route.query.search || '')
  await refreshAt(scrollTop)
}
watch(
  () => route.fullPath,
  () => {
    if (active && route.path === '/users' && lastQuery !== route.fullPath) {
      search.value = String(route.query.search || '')
      scrollTop = 0
      lastQuery = route.fullPath
      void refreshAt(0)
    }
  }
)
onMounted(() => {
  void refresh()
})
onActivated(activate)
onBeforeRouteLeave(rememberScroll)
onDeactivated(() => {
  scrollGeneration++
  active = false
})
onBeforeUnmount(() => {
  scrollGeneration++
  active = false
})
</script>
<template>
  <div class="user-list-page">
    <div class="page-heading between">
      <div>
        <RouterLink v-if="route.query.from === 'statistics'" to="/statistics" class="back-link"
          >‹ 返回数据统计</RouterLink
        >
        <h1>用户列表</h1>
        <p>联系方式与来源只读；场景、听读分别统计，共用学习授权及打卡。</p>
      </div>
      <button type="button" :disabled="busy" @click="refresh">
        <AppIcon name="refresh" :size="18" />刷新
      </button>
    </div>
    <div class="user-list-content">
      <form class="filters user-filters" @submit.prevent="filter({ search })">
        <div class="user-search">
          <input
            v-model="search"
            type="search"
            aria-label="搜索用户"
            placeholder="搜索编号、昵称、手机号或微信号"
          />
          <button type="submit" class="text" aria-label="查询用户">
            <AppIcon name="search" :size="16" />
          </button>
        </div>
        <select
          :value="route.query.authorization_status || 'all'"
          aria-label="学习授权筛选"
          @change="filter({ authorization_status: ($event.target as HTMLSelectElement).value })"
        >
          <option value="all">全部授权状态</option>
          <option value="none">未授权</option>
          <option value="active">授权有效</option>
          <option value="expired">已到期</option>
        </select>
        <select
          :value="checkin"
          aria-label="打卡状态筛选"
          @change="filter({ checkin: ($event.target as HTMLSelectElement).value })"
        >
          <option value="all">全部打卡状态</option>
          <option value="checked">今日已打卡</option>
          <option value="unchecked">今日未打卡</option>
        </select>
        <select
          :value="registered"
          aria-label="注册日期筛选"
          @change="filter({ registered: ($event.target as HTMLSelectElement).value })"
        >
          <option value="all">全部注册日期</option>
          <option value="today">今日注册</option>
        </select>
      </form>
      <AppState
        :busy="busy"
        :error="error"
        :empty="data?.total === 0"
        empty-title="暂无符合条件的用户"
        empty-text="可调整筛选条件或清空搜索重试"
        @retry="refresh"
        ><button
          type="button"
          @click="
            filter({ search: '', registered: 'all', checkin: 'all', authorization_status: 'all' })
          "
        >
          清空条件
        </button></AppState
      >
      <div v-if="data && data.total && !busy && !error" class="table-wrap">
        <table>
          <colgroup>
            <col class="user-column" />
            <col class="contact-column" />
            <col class="completed-column" />
            <col class="completed-column" />
            <col class="streak-column" />
            <col class="checkin-column" />
            <col class="times-column" />
            <col class="authorization-column" />
            <col class="actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th>用户</th>
              <th>联系方式</th>
              <th>已学场景</th>
              <th>已学听读</th>
              <th>连续打卡</th>
              <th>累计打卡</th>
              <th>注册／最近学习</th>
              <th>学习授权</th>
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
                  <div v-else class="avatar default"><AppIcon name="user" :size="17" /></div>
                  <strong>{{ user.nickname || '学习者' }}</strong>
                </div>
                <p class="identifier">{{ user.user_code }}</p>
              </td>
              <td>
                <template v-if="user.phone || user.wechat_contact">
                  <p v-if="user.phone">
                    {{ user.phone }}
                    <small class="badge draft">{{ contactSourceText(user.phone_source) }}</small>
                  </p>
                  <p v-if="user.wechat_contact">
                    {{ user.wechat_contact }}
                    <small class="badge draft">{{ contactSourceText(user.wechat_source) }}</small>
                  </p> </template
                ><span v-else class="muted">未填写</span>
              </td>
              <td>{{ user.statistics.completed_cards }} 张</td>
              <td>{{ user.statistics.completed_articles ?? '暂未获取' }} 篇</td>
              <td>
                {{ user.statistics.current_streak }} 天
                <p>
                  <span class="badge" :class="{ draft: !user.statistics.checked_in_today }">{{
                    user.statistics.checked_in_today ? '今日已打卡' : '今日待打卡'
                  }}</span>
                </p>
              </td>
              <td>{{ user.statistics.total_checkin_days }} 天</td>
              <td class="user-times">
                <p>注册 {{ dateText(user.registered_at) }}</p>
                <p>学习 {{ dateText(user.statistics.last_studied_at) }}</p>
              </td>
              <td class="authorization-cell">
                <span
                  class="badge"
                  :class="{
                    draft: user.authorization?.status === 'expired',
                    offline: !user.authorization || user.authorization.status === 'none'
                  }"
                  >{{
                    user.authorization?.status === 'active'
                      ? '授权有效'
                      : user.authorization?.status === 'expired'
                        ? '已到期'
                        : '未授权'
                  }}</span
                >
                <p>{{ user.authorization?.expires_on || '—' }}</p>
              </td>
              <td>
                <RouterLink :to="{ path: `/users/${user.id}`, query: { back: route.fullPath } }"
                  >查看详情</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data && !error" class="pagination user-pagination">
        <span class="pagination-total">共 {{ data.total }} 位用户 · 注册时间倒序</span>
        <template v-if="data.total > 20"
          ><button :disabled="page <= 1 || busy" @click="filter({ page: page - 1 })">上一页</button
          ><span>第 {{ page }} 页</span
          ><button :disabled="page * 20 >= data.total || busy" @click="filter({ page: page + 1 })">
            下一页
          </button></template
        >
      </div>
      <div class="user-list-note">
        同一授权覆盖场景学习与主题听读。两类已学数量分别计数，连续／累计打卡按同一北京时间日期计算。<br />手机号、微信号及真实来源保留，只读展示；未授权或到期仍可学习当前免费内容。
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.back-link {
  display: block;
  font-size: 13px;
  margin-bottom: 12px;
}

.user-filters {
  gap: 10px;
  margin-bottom: 18px;

  select {
    width: 142px;
    min-height: 40px;
    font-size: 12px;
  }

  .user-search {
    display: flex;
    align-items: center;
    width: 320px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);

    input {
      flex: 1;
      min-width: 0;
      border: 0;
      width: 100%;
      font-size: 12px;
    }

    button {
      padding: 0 12px;
      min-height: 40px;
    }
  }
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;

  &.default {
    display: grid;
    place-items: center;
    background: transparent;
    width: 18px;
    height: 18px;
  }
}

.user-list-content {
  .table-wrap {
    border-radius: 12px;
  }

  table {
    table-layout: fixed;
    min-width: 1120px;

    .user-column {
      width: 12%;
    }

    .contact-column {
      width: 21%;
    }

    .completed-column,
    .checkin-column {
      width: 8%;
    }

    .authorization-column {
      width: 10%;
    }

    .streak-column {
      width: 10%;
    }

    .actions-column {
      width: 7%;
    }

    .times-column {
      width: 16%;
    }
  }

  td {
    height: 124px;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .badge {
    font-size: 10px;
    padding: 2px 6px;
  }

  .user-times {
    font-size: 12px;
    line-height: 1.8;

    p {
      white-space: nowrap;
    }
  }

  .user-pagination {
    border: 0;
    background: transparent;
    min-height: 58px;
    color: var(--muted);
    font-size: 12px;
  }

  .pagination-total {
    margin-right: auto;
  }
}

.identifier {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}

.authorization-cell p {
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}

.user-list-note {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--soft);
  font-size: 12px;
  line-height: 1.8;
}
</style>

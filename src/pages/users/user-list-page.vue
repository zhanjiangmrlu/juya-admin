<script setup lang="ts">
import {
  ElButton,
  ElEmpty,
  ElForm,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag
} from 'element-plus'
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

import emptySearch from '@/assets/icons/empty-search.svg'
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
  // ElTable 注册列后还会更新表体，等待页面撑高再恢复滚动
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
  <div class="user-list-page management-page">
    <div class="page-heading between">
      <div>
        <RouterLink v-if="route.query.from === 'statistics'" to="/statistics" class="back-link"
          >‹ 返回数据统计</RouterLink
        >
        <h1>用户列表</h1>
        <p>场景、听读分别统计，共用学习授权及打卡。</p>
      </div>
      <ElButton :disabled="busy" @click="refresh">
        <AppIcon name="refresh" :size="18" />刷新
      </ElButton>
    </div>
    <div class="user-list-content">
      <ElForm class="user-filters" @submit.prevent="filter({ search })">
        <ElInput
          v-model="search"
          class="user-search"
          aria-label="搜索用户"
          placeholder="搜索用户编号或昵称"
        >
          <template #suffix
            ><ElButton native-type="submit" link aria-label="查询用户"
              ><AppIcon name="search" :size="16" /></ElButton
          ></template>
        </ElInput>
        <ElSelect
          popper-class="management-popper"
          :model-value="String(route.query.authorization_status || 'all')"
          aria-label="学习授权筛选"
          @change="filter({ authorization_status: $event })"
        >
          <ElOption value="all" label="全部授权状态" /><ElOption
            value="none"
            label="未授权"
          /><ElOption value="active" label="授权有效" /><ElOption value="expired" label="已到期" />
        </ElSelect>
        <ElSelect
          popper-class="management-popper"
          :model-value="checkin"
          aria-label="打卡状态筛选"
          @change="filter({ checkin: $event })"
        >
          <ElOption value="all" label="全部打卡状态" /><ElOption
            value="checked"
            label="今日已打卡"
          /><ElOption value="unchecked" label="今日未打卡" />
        </ElSelect>
        <ElSelect
          popper-class="management-popper"
          :model-value="registered"
          aria-label="注册日期筛选"
          @change="filter({ registered: $event })"
        >
          <ElOption value="all" label="全部注册日期" /><ElOption value="today" label="今日注册" />
        </ElSelect>
      </ElForm>
      <AppState element-plus :busy="busy" :error="error" @retry="refresh" />
      <div v-if="data && !busy && !error" class="table-wrap">
        <ElTable :data="data.items" class="users-table" row-key="id">
          <template #empty>
            <ElEmpty class="user-empty" :image="emptySearch" :image-size="36">
              <template #description>
                <h3>没有符合条件的用户</h3>
                <p>试试其他用户编号或昵称，或清空筛选后查看。</p>
              </template>
              <ElButton
                @click="
                  filter({
                    search: '',
                    registered: 'all',
                    checkin: 'all',
                    authorization_status: 'all'
                  })
                "
                >清空筛选</ElButton
              >
            </ElEmpty>
          </template>
          <ElTableColumn label="用户" :min-width="170">
            <template #default="{ row: user }"
              ><div class="row">
                <img v-if="user.avatar_id" :src="mediaURL(user.avatar_id)" class="avatar" alt="" />
                <div v-else class="avatar default"><AppIcon name="user" :size="17" /></div>
                <strong>{{ user.nickname || '学习者' }}</strong>
              </div>
              <p class="identifier">{{ user.user_code }}</p></template
            >
          </ElTableColumn>
          <ElTableColumn label="已学场景" :min-width="100"
            ><template #default="{ row: user }"
              >{{ user.statistics.completed_cards }} 张</template
            ></ElTableColumn
          >
          <ElTableColumn label="已学听读" :min-width="100"
            ><template #default="{ row: user }"
              >{{ user.statistics.completed_articles ?? '暂未获取' }} 篇</template
            ></ElTableColumn
          >
          <ElTableColumn label="连续打卡" :min-width="120"
            ><template #default="{ row: user }"
              >{{ user.statistics.current_streak }} 天
              <p>
                <ElTag
                  :type="user.statistics.checked_in_today ? 'success' : 'warning'"
                  size="small"
                  >{{ user.statistics.checked_in_today ? '今日已打卡' : '今日待打卡' }}</ElTag
                >
              </p></template
            ></ElTableColumn
          >
          <ElTableColumn label="累计打卡" :min-width="100"
            ><template #default="{ row: user }"
              >{{ user.statistics.total_checkin_days }} 天</template
            ></ElTableColumn
          >
          <ElTableColumn label="注册／最近学习" :min-width="200" class-name="user-times"
            ><template #default="{ row: user }"
              ><p>注册 {{ dateText(user.registered_at) }}</p>
              <p>学习 {{ dateText(user.statistics.last_studied_at) }}</p></template
            ></ElTableColumn
          >
          <ElTableColumn label="学习授权" :min-width="120" class-name="authorization-cell"
            ><template #default="{ row: user }"
              ><ElTag
                :type="
                  user.authorization?.status === 'active'
                    ? 'success'
                    : user.authorization?.status === 'expired'
                      ? 'warning'
                      : 'info'
                "
                size="small"
                >{{
                  user.authorization?.status === 'active'
                    ? '授权有效'
                    : user.authorization?.status === 'expired'
                      ? '已到期'
                      : '未授权'
                }}</ElTag
              >
              <p>{{ user.authorization?.expires_on || '—' }}</p></template
            ></ElTableColumn
          >
          <ElTableColumn label="操作" :width="90" fixed="right"
            ><template #default="{ row: user }"
              ><RouterLink :to="{ path: `/users/${user.id}`, query: { back: route.fullPath } }"
                >查看详情</RouterLink
              ></template
            ></ElTableColumn
          >
        </ElTable>
      </div>
      <div v-if="data && !error" class="user-pagination">
        <span class="pagination-total"
          >{{ data.total ? '共' : '匹配' }} {{ data.total }} 位用户 · 注册时间倒序</span
        >
        <ElPagination
          :current-page="page"
          :page-size="20"
          :total="data.total"
          :disabled="busy"
          layout="prev, pager, next"
          prev-text="上一页"
          next-text="下一页"
          @current-change="filter({ page: $event })"
        />
      </div>
      <div class="user-list-note">
        同一授权覆盖场景学习与主题听读。两类已学数量分别计数，连续／累计打卡按同一北京时间日期计算。<br />未授权或到期仍可学习管理员指定的免费内容。
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.user-list-page {
  .page-heading {
    align-items: center;
    min-height: 89px;
    margin-top: -6px;
    margin-bottom: 18px;

    > div {
      align-self: flex-start;
    }

    p {
      font-size: 13px;
    }
  }
}

.back-link {
  display: block;
  font-size: 13px;
  margin-bottom: 12px;
}

.user-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;

  .el-select {
    width: 142px;
  }

  .user-search {
    width: 320px;

    :deep([class~='el-input__wrapper']) {
      min-height: 40px;
    }
  }

  :deep([class~='el-input__wrapper']),
  :deep([class~='el-select__wrapper']) {
    min-height: 40px;
    font-size: 12px;
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

  .user-empty {
    min-height: 330px;
    padding: 40px 16px;
    line-height: 1.8;

    :deep([class~='el-empty__description']) {
      margin-top: 14px;
    }

    h3 {
      color: var(--ink);
      font-size: 18px;
      line-height: 35px;
    }

    p {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
      line-height: 35px;
    }

    :deep([class~='el-empty__bottom']) {
      margin-top: 14px;
    }

    .el-button {
      width: 114px;
      height: 40px;
      background: var(--bg);
    }
  }

  .users-table {
    --el-table-header-bg-color: #f3f6ee;

    :deep([class~='el-table__empty-block']) {
      min-height: 375px;
      align-items: flex-start;
    }

    :deep([class~='el-table__empty-text']) {
      width: 100%;
    }

    :deep([class~='el-table__cell']) {
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    :deep(td[class~='el-table__cell']) {
      height: 124px;
    }

    :deep(.el-tag) {
      font-size: 10px;
      padding: 2px 6px;
      height: auto;
      line-height: 16px;
    }

    :deep(.user-times) {
      font-size: 12px;
      line-height: 1.8;
    }

    :deep(.user-times p) {
      white-space: nowrap;
    }

    :deep(th[class~='el-table__cell']) {
      height: 47px;
      font-size: 12px;
    }

    :deep(.authorization-cell p) {
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
    }
  }

  .user-pagination {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
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

.user-list-note {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--soft);
  font-size: 12px;
  line-height: 1.8;
}
</style>

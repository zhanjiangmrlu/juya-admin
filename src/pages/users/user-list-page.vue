<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'

import DataTable from '@/components/data-table/data-table.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { useUserList } from '@/features/users/use-user-list'
import { createUserAdapter } from '@/features/users/user-adapter'
import { getAccountStatusLabel, getAccountStatusTone } from '@/features/users/user-model'
import { createApiClient } from '@/services/api/api-client'

const router = useRouter()
const authStore = useAuthStore()
const filters = reactive({ mode: 'normal', query: '' })
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  onUnauthorized: () => {
    authStore.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const controller = useUserList(createUserAdapter(client), router)

onMounted(() => void controller.search())
onBeforeUnmount(controller.dispose)

/**
 * 根据当前搜索模式提交普通查询或完整微信号查询
 *
 * @returns 搜索完成后的 Promise
 */
async function submitSearch(): Promise<void> {
  if (filters.mode === 'wechat') {
    await controller.searchByWechat(filters.query)
    return
  }
  await controller.search(filters.query)
}

/**
 * 格式化用户最近活跃时间
 *
 * @param value - ISO 8601 时间或空值
 * @returns 管理端日期时间文案
 */
function formatLastActive(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '暂无记录'
}
</script>

<template>
  <section class="user-list-page">
    <ElCard class="panel" shadow="never">
      <template #header>
        <div class="heading">
          <div>
            <h2>用户管理</h2>
            <p>普通条件使用 GET；完整微信号使用 POST 且不写入地址栏。</p>
          </div>
          <ElButton disabled type="primary">联系资料列表接口待接入</ElButton>
        </div>
      </template>

      <ElForm class="filters" inline @submit.prevent="submitSearch">
        <ElFormItem>
          <ElSelect v-model="filters.mode" aria-label="搜索方式" class="mode">
            <ElOption label="编号 / 普通条件" value="normal" />
            <ElOption label="完整微信号" value="wechat" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElInput
            v-model="filters.query"
            :maxlength="filters.mode === 'wechat' ? 64 : 64"
            :placeholder="filters.mode === 'wechat' ? '输入完整微信号' : '输入用户编号或普通条件'"
            :prefix-icon="Search"
            clearable
            @keyup.enter="submitSearch"
          />
        </ElFormItem>
        <ElFormItem><ElButton native-type="submit" type="primary">查询</ElButton></ElFormItem>
        <ElFormItem>
          <ElSelect
            aria-label="联系状态筛选（待接入）"
            class="pending-filter"
            disabled
            model-value=""
            placeholder="全部联系状态"
          />
        </ElFormItem>
        <ElFormItem>
          <ElSelect
            aria-label="权益筛选（待接入）"
            class="pending-filter"
            disabled
            model-value=""
            placeholder="全部权益"
          />
        </ElFormItem>
      </ElForm>

      <ElAlert
        v-if="filters.mode === 'wechat'"
        class="notice"
        :closable="false"
        title="敏感搜索不会进入 URL、浏览器存储或普通错误日志"
        type="info"
        show-icon
      />
      <ElAlert
        v-if="controller.error.value"
        class="notice"
        :closable="false"
        :title="controller.error.value"
        type="error"
        show-icon
      />

      <DataTable
        :empty-text="controller.state.value === 'empty' ? '未找到匹配用户' : '暂无用户数据'"
        :loading="controller.state.value === 'loading'"
        row-key="user_id"
        :rows="controller.users.value"
      >
        <ElTableColumn label="对象" min-width="260">
          <template #default="{ row }">
            <div class="identity">
              <strong>{{ row.user_id }}</strong>
              <span>昵称与头像接口未提供</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" min-width="130">
          <template #default="{ row }">
            <StatusTag
              :label="getAccountStatusLabel(row.account_status)"
              :tone="getAccountStatusTone(row.account_status)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="权益" min-width="170">
          <template #default="{ row }">
            正式 {{ row.formal_entitlement_count }} · 限时 {{ row.limited_entitlement_count }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="待处理反馈" min-width="120" prop="open_feedback_count" />
        <ElTableColumn label="最近活跃" min-width="170">
          <template #default="{ row }">{{ formatLastActive(row.last_active_at) }}</template>
        </ElTableColumn>
        <ElTableColumn fixed="right" label="操作" width="90">
          <template #default="{ row }">
            <RouterLink
              v-slot="{ navigate }"
              custom
              :to="{ name: 'user-detail', params: { userId: row.user_id } }"
            >
              <ElButton size="small" type="primary" link @click="navigate">查看</ElButton>
            </RouterLink>
          </template>
        </ElTableColumn>
      </DataTable>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.user-list-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }

  .heading h2 {
    margin: 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  .heading p {
    margin: 5px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
  }

  .mode {
    width: 148px;
  }

  .pending-filter {
    width: 132px;
  }

  .notice {
    margin-bottom: 16px;
  }

  .identity {
    display: grid;
    gap: 3px;
  }

  .identity strong {
    color: var(--juya-color-text-primary);
    font-size: 13px;
  }

  .identity span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}
</style>

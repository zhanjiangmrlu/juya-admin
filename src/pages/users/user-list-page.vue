<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import DataTable from '@/components/data-table/data-table.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createContactCapabilities } from '@/features/contacts/contact-capabilities'
import { useContactCorrections } from '@/features/contacts/use-contact-corrections'
import { useUserList } from '@/features/users/use-user-list'
import { createUserAdapter } from '@/features/users/user-adapter'
import { getAccountStatusLabel, getAccountStatusTone } from '@/features/users/user-model'
import { createApiClient } from '@/services/api/api-client'

import type { ContactStatus } from '@/features/users/user-adapter'

const router = useRouter()
const authStore = useAuthStore()
const filters = reactive<{
  contactStatus: '' | ContactStatus
  mode: 'normal' | 'wechat'
  query: string
}>({ contactStatus: '', mode: 'normal', query: '' })
const view = ref<'corrections' | 'users'>('users')
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getCsrfToken: () => authStore.csrfToken,
  onUnauthorized: () => {
    authStore.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const controller = useUserList(createUserAdapter(client), router)
const corrections = useContactCorrections(createContactCapabilities(client))
const contactStatusOptions: { label: string; value: ContactStatus }[] = [
  { label: '未填写', value: 'NOT_PROVIDED' },
  { label: '待联系', value: 'PENDING' },
  { label: '已联系', value: 'CONTACTED' },
  { label: '暂无法联系', value: 'UNREACHABLE' },
  { label: '不希望联系', value: 'DO_NOT_CONTACT' }
]

onMounted(() => void controller.search())
onBeforeUnmount(() => {
  controller.dispose()
  corrections.dispose()
})

/** 根据当前搜索模式提交用户查询。 */
async function submitSearch(): Promise<void> {
  if (filters.mode === 'wechat') {
    await controller.searchByWechat(filters.query)
    return
  }
  await controller.search(filters.query, filters.contactStatus || undefined)
}

/** 切换用户与联系更正列表。 */
async function toggleView(): Promise<void> {
  view.value = view.value === 'users' ? 'corrections' : 'users'
  if (view.value === 'corrections') await corrections.loadList()
}

/**
 * 格式化管理端日期时间。
 * @param value - ISO 8601 时间或空值
 * @returns 管理端日期时间文案
 */
function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '暂无记录'
}

/**
 * 返回联系状态中文标签。
 * @param status - 联系状态代码
 * @returns 中文状态标签
 */
function contactStatusLabel(status: string | undefined): string {
  return contactStatusOptions.find((item) => item.value === status)?.label ?? '未填写'
}
</script>

<template>
  <section class="user-list-page">
    <ElCard class="panel" shadow="never">
      <template #header>
        <div class="heading">
          <div>
            <h2>{{ view === 'users' ? '用户管理' : '联系资料更正申请' }}</h2>
            <p>
              {{
                view === 'users'
                  ? '普通条件使用 GET；完整微信号使用 POST 且不写入地址栏。'
                  : '查看用户提交的修改机会申请，并进入详情执行批准或拒绝。'
              }}
            </p>
          </div>
          <ElButton type="primary" @click="toggleView">
            {{ view === 'users' ? '查看联系更正申请' : '返回用户列表' }}
          </ElButton>
        </div>
      </template>

      <template v-if="view === 'users'">
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
              maxlength="64"
              :placeholder="filters.mode === 'wechat' ? '输入完整微信号' : '输入用户编号或普通条件'"
              :prefix-icon="Search"
              clearable
              @keyup.enter="submitSearch"
            />
          </ElFormItem>
          <ElFormItem><ElButton native-type="submit" type="primary">查询</ElButton></ElFormItem>
          <ElFormItem>
            <ElSelect
              v-model="filters.contactStatus"
              aria-label="联系状态筛选"
              class="status-filter"
              clearable
              placeholder="全部联系状态"
              @change="submitSearch"
            >
              <ElOption
                v-for="option in contactStatusOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElSelect
              class="entitlement-filter"
              disabled
              model-value=""
              placeholder="全部权益"
              aria-label="权益筛选（待接入）"
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
          <ElTableColumn label="对象" min-width="200">
            <template #default="{ row }">
              <div class="identity">
                <strong>{{ row.user_id }}</strong>
                <span>最近活跃：{{ formatDateTime(row.last_active_at) }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="账号状态" min-width="115">
            <template #default="{ row }">
              <StatusTag
                :label="getAccountStatusLabel(row.account_status)"
                :tone="getAccountStatusTone(row.account_status)"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn label="微信号" min-width="180">
            <template #default="{ row }">
              <span class="contact-value">{{ row.contact?.wechat_id || '未填写' }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="联系状态" min-width="125">
            <template #default="{ row }">{{
              contactStatusLabel(row.contact?.contact_status)
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="权益" min-width="150">
            <template #default="{ row }">
              正式 {{ row.formal_entitlement_count }} · 限时 {{ row.limited_entitlement_count }}
            </template>
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
      </template>

      <template v-else>
        <ElAlert
          v-if="corrections.error.value"
          class="notice"
          :closable="false"
          :title="corrections.error.value"
          type="error"
          show-icon
        />
        <DataTable
          :empty-text="corrections.state.value === 'empty' ? '暂无联系更正申请' : '暂无数据'"
          :loading="corrections.state.value === 'loading'"
          row-key="id"
          :rows="corrections.items.value"
        >
          <ElTableColumn label="申请编号" min-width="140" prop="id" />
          <ElTableColumn label="用户" min-width="180">
            <template #default="{ row }">
              <div class="identity">
                <strong>{{ row.juya_number }}</strong
                ><span>{{ row.nickname || row.user_id }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="当前微信号" min-width="180" prop="wechat_id" />
          <ElTableColumn label="更正原因" min-width="260" show-overflow-tooltip prop="reason" />
          <ElTableColumn label="状态" min-width="110" prop="status" />
          <ElTableColumn label="申请时间" min-width="160">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </ElTableColumn>
          <ElTableColumn fixed="right" label="操作" width="90">
            <template #default="{ row }">
              <RouterLink
                v-slot="{ navigate }"
                custom
                :to="{ name: 'contact-correction', params: { id: row.id } }"
              >
                <ElButton size="small" type="primary" link @click="navigate">处理</ElButton>
              </RouterLink>
            </template>
          </ElTableColumn>
        </DataTable>
      </template>
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

  .status-filter {
    width: 148px;
  }

  .entitlement-filter {
    width: 120px;
  }

  .notice {
    margin-bottom: 16px;
  }

  .identity {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .identity strong,
  .contact-value {
    color: var(--juya-color-text-primary);
    font-family: inherit;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .identity span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}
</style>

<script setup lang="ts">
import { UserFilled } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SensitiveValue from '@/components/sensitive-value/sensitive-value.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import {
  copyContactValue,
  createContactCapabilities
} from '@/features/contacts/contact-capabilities'
import { useUserDetail } from '@/features/users/use-user-detail'
import { createUserAdapter } from '@/features/users/user-adapter'
import { getAccountStatusLabel, getAccountStatusTone } from '@/features/users/user-model'
import UserRelatedRecords from '@/features/users/user-related-records.vue'
import { createApiClient } from '@/services/api/api-client'

import type { ContactStatus } from '@/features/contacts/contact-capabilities'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const userId = computed(() => String(route.params.userId))
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getCsrfToken: () => authStore.csrfToken,
  onUnauthorized: () => {
    authStore.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const controller = useUserDetail(createUserAdapter(client), userId)
const contactCapabilities = createContactCapabilities(client)
const selectedStatus = ref<ContactStatus>('PENDING')
const contactBusy = ref(false)
const copyBusy = ref(false)
const actionError = ref<string | null>(null)
const copyFeedback = ref<string | null>(null)
const contactStatusOptions: { label: string; value: ContactStatus }[] = [
  { label: '未填写', value: 'NOT_PROVIDED' },
  { label: '待联系', value: 'PENDING' },
  { label: '已联系', value: 'CONTACTED' },
  { label: '暂无法联系', value: 'UNREACHABLE' },
  { label: '不希望联系', value: 'DO_NOT_CONTACT' }
]

watch(
  () => controller.detail.value?.contact?.contact_status,
  (status) => {
    if (status) selectedStatus.value = status
  }
)
onMounted(() => void controller.load())
onBeforeUnmount(controller.dispose)

/**
 * 格式化管理端日期时间。
 * @param value - ISO 8601 时间或空值
 * @returns 管理端日期时间文案
 */
function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '暂无记录'
}

/** 更新联系状态并重新读取详情。 */
async function updateContactStatus(): Promise<void> {
  contactBusy.value = true
  actionError.value = null
  try {
    await contactCapabilities.updateStatus(userId.value, selectedStatus.value)
    await controller.load()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '联系状态更新失败，请稍后重试'
  } finally {
    contactBusy.value = false
  }
}

/** 核对微信号变更并重新读取详情。 */
async function verifyContactChange(): Promise<void> {
  contactBusy.value = true
  actionError.value = null
  try {
    await contactCapabilities.verifyChange(userId.value)
    await controller.load()
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '微信号核对失败，请稍后重试'
  } finally {
    contactBusy.value = false
  }
}

/** 审计成功后复制完整微信号。 */
async function copyWechat(): Promise<void> {
  const value = controller.detail.value?.contact?.wechat_id
  if (!value) return
  copyBusy.value = true
  actionError.value = null
  copyFeedback.value = null
  try {
    await copyContactValue(contactCapabilities, userId.value, value)
    copyFeedback.value = '微信号已复制，审计记录已保存'
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : '复制审计失败，未写入剪贴板'
  } finally {
    copyBusy.value = false
  }
}
</script>

<template>
  <section class="user-detail-page">
    <ElAlert
      v-if="controller.error.value"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <ElSkeleton v-else-if="controller.state.value === 'loading'" :rows="8" animated />

    <template v-else-if="controller.detail.value">
      <div class="toolbar">
        <div>
          <span>A03</span>
          <h2>
            用户详情 · {{ controller.detail.value.juya_number || controller.detail.value.user_id }}
          </h2>
        </div>
        <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }">
          <ElButton @click="navigate">返回用户列表</ElButton>
        </RouterLink>
      </div>

      <div class="grid">
        <div class="column">
          <ElCard shadow="never">
            <template #header><h3 class="panel-title">基本身份</h3></template>
            <div class="profile">
              <ElAvatar :src="controller.detail.value.avatar_url || undefined" :size="48"
                ><ElIcon><UserFilled /></ElIcon
              ></ElAvatar>
              <div class="profile-copy">
                <strong>{{ controller.detail.value.nickname || '未设置昵称' }}</strong
                ><span>{{
                  controller.detail.value.juya_number || controller.detail.value.user_id
                }}</span>
                <StatusTag
                  :label="getAccountStatusLabel(controller.detail.value.account_status)"
                  :tone="getAccountStatusTone(controller.detail.value.account_status)"
                />
                <span>最近活跃：{{ formatDateTime(controller.detail.value.last_active_at) }}</span>
              </div>
            </div>
          </ElCard>

          <ElCard shadow="never">
            <template #header><h3 class="panel-title">学习与运营概况</h3></template>
            <ElAlert
              v-if="controller.sectionStates.value.learning === 'error'"
              class="notice"
              :closable="false"
              title="学习概况上游暂时不可用，其他区块仍可正常查看"
              type="warning"
              show-icon
            />
            <div v-else class="metrics">
              <div>
                <span>开放场景完成数</span
                ><strong>{{ controller.detail.value.open_scene_completed_count }}</strong>
              </div>
              <div>
                <span>学习天数</span><strong>{{ controller.detail.value.learning_days }}</strong>
              </div>
              <div>
                <span>收藏数</span><strong>{{ controller.detail.value.favorite_count }}</strong>
              </div>
              <div>
                <span>待处理反馈</span
                ><strong>{{ controller.detail.value.open_feedback_count }}</strong>
              </div>
            </div>
          </ElCard>
        </div>

        <ElCard class="contact" shadow="never">
          <template #header><h3 class="panel-title">联系与审计</h3></template>
          <ElAlert
            v-if="controller.sectionStates.value.contact === 'error'"
            :closable="false"
            title="联系方式上游暂时不可用，其他用户区块仍可正常查看"
            type="warning"
            show-icon
          />
          <template v-else>
            <div class="contact-row">
              <span>微信号</span>
              <SensitiveValue
                :can-copy="contactCapabilities.canCopySensitiveValue"
                :copying="copyBusy"
                :value="controller.detail.value.contact?.wechat_id ?? null"
                @copy="copyWechat"
              />
            </div>
            <div class="contact-row">
              <span>联系状态</span>
              <ElSelect v-model="selectedStatus" aria-label="联系状态">
                <ElOption
                  v-for="option in contactStatusOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
            </div>
            <div class="contact-meta">
              <span
                >待核对变更：{{
                  controller.detail.value.contact?.change_pending ? '是' : '否'
                }}</span
              >
              <span
                >最近核对：{{
                  formatDateTime(controller.detail.value.contact?.verified_at ?? null)
                }}</span
              >
              <span
                >最近联系方式变更：{{
                  formatDateTime(controller.detail.value.contact_changed_at ?? null)
                }}</span
              >
              <span>核对管理员：{{ controller.detail.value.contact?.verified_by || '暂无' }}</span>
            </div>
          </template>
          <ElAlert
            v-if="actionError"
            class="notice"
            :closable="false"
            :title="actionError"
            type="error"
            show-icon
          />
          <p v-if="copyFeedback" class="copy-feedback" role="status">{{ copyFeedback }}</p>
          <div class="actions">
            <ElButton
              :disabled="!controller.detail.value.contact"
              :loading="contactBusy"
              @click="updateContactStatus"
            >
              更新状态
            </ElButton>
            <ElButton
              :disabled="!controller.detail.value.contact?.change_pending"
              :loading="contactBusy"
              type="primary"
              @click="verifyContactChange"
            >
              已核对微信号变更
            </ElButton>
          </div>
        </ElCard>
      </div>
      <UserRelatedRecords :records="controller.detail.value.records ?? {}" />
    </template>
  </section>
</template>

<style scoped lang="scss">
.user-detail-page {
  .toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .toolbar span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .toolbar h2,
  .panel-title {
    margin: 0;
    color: var(--juya-color-sidebar);
  }

  .toolbar h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  .panel-title {
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
    gap: 14px;
  }

  .column {
    display: grid;
    min-width: 0;
    gap: 14px;
  }

  .profile {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .avatar {
    display: grid;
    width: 58px;
    height: 58px;
    border-radius: 18px;
    background: #d8eee3;
    color: var(--juya-color-primary);
    font-size: 26px;
    place-items: center;
  }

  .profile-copy {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
    flex-wrap: wrap;
  }

  .profile-copy strong {
    width: 100%;
    overflow-wrap: anywhere;
    font-size: 17px;
  }

  .profile-copy span {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .metrics div {
    min-height: 92px;
    padding: 16px;
    border: 1px solid var(--juya-color-border);
    border-radius: var(--juya-panel-radius);
  }

  .metrics span,
  .metrics strong {
    display: block;
  }

  .metrics span {
    margin-bottom: 8px;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .metrics strong {
    color: var(--juya-color-sidebar);
    font-size: 24px;
  }

  .notice {
    margin-bottom: 14px;
  }

  .contact {
    min-width: 0;
    min-height: 390px;
  }

  .contact-row {
    display: grid;
    gap: 7px;
    margin-bottom: 20px;
  }

  .contact-row > span,
  .contact-meta {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  .contact-meta {
    display: grid;
    gap: 6px;
    margin-bottom: 16px;
  }

  .copy-feedback {
    margin: 12px 0 0;
    color: var(--juya-color-success);
    font-size: 12px;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
  }
}

@media (width <= 1100px) {
  .user-detail-page {
    .grid {
      grid-template-columns: 1fr;
    }

    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

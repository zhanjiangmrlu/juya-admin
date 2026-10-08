<script setup lang="ts">
import { UserFilled } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ADMIN_SECTION_TITLES } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
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
import { formatDateTime as formatTimestamp } from '@/shared/utils/date-time'

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
  return formatTimestamp(value, '暂无记录')
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
  <section class="user-detail-page admin-brand-headings">
    <ElAlert
      v-if="controller.error.value"
      :closable="false"
      :title="controller.error.value"
      type="error"
      show-icon
    />
    <ElSkeleton v-else-if="controller.state.value === 'loading'" :rows="8" animated />
    <template v-else-if="controller.detail.value">
      <div class="grid">
        <AdminPanel
          :title="ADMIN_SECTION_TITLES.userDetail.identityCard"
          title-class="panel-title"
          class="identity-card"
        >
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
          </template>
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
        </AdminPanel>
        <AdminPanel class="contact">
          <template #header
            ><div class="card-heading">
              <h3 class="panel-title">联系与操作审计</h3>
              <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }"
                ><ElButton @click="navigate">返回用户列表</ElButton></RouterLink
              >
            </div></template
          >
          <template v-if="controller.sectionStates.value.contact !== 'error'">
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
          <div class="audit-item">
            <strong>反馈记录</strong
            ><span>待处理 {{ controller.detail.value.open_feedback_count }} 条</span>
          </div>
          <div class="audit-item">
            <strong>账号状态</strong
            ><span>{{ getAccountStatusLabel(controller.detail.value.account_status) }}</span>
          </div>
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
        </AdminPanel>
      </div>
      <aside class="management-note">
        <strong>管理提醒</strong>
        <p>同一用户详情串联身份、学习、权益、反馈、注销与审计，不建立冲突档案。</p>
      </aside>
      <UserRelatedRecords :records="controller.detail.value.records ?? {}" />
    </template>
  </section>
</template>

<style scoped lang="scss">
.user-detail-page {
  min-width: 0;
  padding-top: 5px;

  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .card-heading .el-button {
    font-size: 12px;
  }

  .record-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin: 0 0 18px;
    color: #657a68;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .toolbar p {
    margin: 0;
    color: #657a68;
    font-size: 13px;
  }

  .panel-title {
    margin: 0;
    color: #244633;
    font-size: 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 690fr) minmax(0, 452fr);
    gap: 18px;
  }

  .grid :deep(.el-card) {
    min-width: 0;
    min-height: 570px;
    border: 1px solid #d8e5d1;
    border-radius: 18px;
    background: #fffdf7;
  }

  .grid :deep([class~='el-card__header']) {
    padding: 18px 20px 12px;
    border-bottom: 0;
  }

  .grid :deep([class~='el-card__body']) {
    padding: 12px 20px 20px;
  }

  .grid .identity-card {
    background: #eaf2e3;
  }

  .profile {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }

  .profile-copy {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px 12px;
    flex-wrap: wrap;
  }

  .profile-copy strong {
    width: 100%;
    color: #244633;
    font-size: 16px;
    overflow-wrap: anywhere;
  }

  .profile-copy span {
    color: #657a68;
    font-size: 12px;
  }

  .contact-row {
    display: grid;
    gap: 6px;
    margin-bottom: 20px;
  }

  .contact-row > span {
    color: #657a68;
    font-size: 13px;
  }

  .contact-row :deep(.sensitive-value) {
    min-height: 38px;
    box-sizing: border-box;
    padding: 4px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .metrics div {
    min-width: 0;
  }

  .metrics span,
  .metrics strong {
    display: block;
  }

  .metrics span {
    margin-bottom: 6px;
    color: #657a68;
    font-size: 13px;
  }

  .metrics strong {
    min-height: 38px;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid #c9dac3;
    border-radius: 10px;
    background: #fffdf7;
    color: #244633;
    font-size: 14px;
  }

  .contact :deep([class~='el-card__body']) {
    display: flex;
    min-height: 480px;
    box-sizing: border-box;
    flex-direction: column;
  }

  .contact-meta {
    display: grid;
    gap: 24px;
    padding-top: 26px;
    margin-bottom: 28px;
    color: #657a68;
    font-size: 12px;
  }

  .contact-meta span,
  .audit-item {
    padding-left: 16px;
    border-left: 5px solid #4f833d;
    overflow-wrap: anywhere;
  }

  .contact-meta :where(span:first-child) {
    border-left-color: #b37b32;
  }

  .audit-item {
    margin-bottom: 28px;
  }

  .audit-item strong,
  .audit-item span {
    display: block;
  }

  .audit-item strong {
    color: #244633;
    font-size: 13px;
  }

  .audit-item span {
    margin-top: 7px;
    color: #657a68;
    font-size: 12px;
  }

  .notice {
    margin-bottom: 14px;
  }

  .copy-feedback {
    margin: 12px 0;
    color: #4e7f3b;
    font-size: 12px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: auto;
  }

  .actions .el-button {
    min-height: 44px;
    margin-left: 0;
  }

  .management-note {
    margin-top: 18px;
    padding: 16px;
    border-radius: 16px;
    background: #e5f0dc;
    color: #244633;
  }

  .management-note strong {
    color: #4e7f3b;
    font-size: 14px;
  }

  .management-note p {
    margin: 20px 0 6px;
    font-size: 13px;
    line-height: 1.7;
  }
}

@media (width <= 1000px) {
  .user-detail-page {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .toolbar {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
  }
}
</style>

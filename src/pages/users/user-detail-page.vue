<script setup lang="ts">
import { UserFilled } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SensitiveValue from '@/components/sensitive-value/sensitive-value.vue'
import StatusTag from '@/components/status-tag/status-tag.vue'
import { useAuthStore } from '@/features/auth/auth-store'
import { createContactCapabilities } from '@/features/contacts/contact-capabilities'
import { useUserDetail } from '@/features/users/use-user-detail'
import { createUserAdapter } from '@/features/users/user-adapter'
import { getAccountStatusLabel, getAccountStatusTone } from '@/features/users/user-model'
import { createApiClient } from '@/services/api/api-client'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const userId = computed(() => String(route.params.userId))
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  onUnauthorized: () => {
    authStore.clearSensitiveState()
    void router.replace({ name: 'login' })
  }
})
const controller = useUserDetail(createUserAdapter(client), userId)
const contactCapabilities = createContactCapabilities(client)

onMounted(() => void controller.load())
onBeforeUnmount(controller.dispose)

/**
 * 格式化最近活跃时间。
 *
 * @param value - ISO 8601 时间或空值。
 * @returns 管理端日期时间文案。
 */
function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '暂无记录'
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
      <div class="user-detail-page__toolbar">
        <div>
          <span>A03</span>
          <h2>用户详情 · {{ controller.detail.value.user_id }}</h2>
        </div>
        <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }">
          <ElButton @click="navigate">返回用户列表</ElButton>
        </RouterLink>
      </div>

      <div class="user-detail-page__grid">
        <div class="user-detail-page__column">
          <ElCard shadow="never">
            <template #header><h3 class="user-detail-page__panel-title">基本身份</h3></template>
            <div class="user-detail-page__profile">
              <span class="user-detail-page__avatar"
                ><ElIcon><UserFilled /></ElIcon
              ></span>
              <div class="user-detail-page__profile-copy">
                <strong>{{ controller.detail.value.user_id }}</strong>
                <StatusTag
                  :label="getAccountStatusLabel(controller.detail.value.account_status)"
                  :tone="getAccountStatusTone(controller.detail.value.account_status)"
                />
                <span>最近活跃：{{ formatDateTime(controller.detail.value.last_active_at) }}</span>
              </div>
            </div>
          </ElCard>

          <ElCard shadow="never">
            <template #header
              ><h3 class="user-detail-page__panel-title">学习与运营概况</h3></template
            >
            <div class="user-detail-page__metrics">
              <div>
                <span>正式权益</span
                ><strong>{{ controller.detail.value.formal_entitlement_count }}</strong>
              </div>
              <div>
                <span>限时权益</span
                ><strong>{{ controller.detail.value.limited_entitlement_count }}</strong>
              </div>
              <div>
                <span>待处理反馈</span
                ><strong>{{ controller.detail.value.open_feedback_count }}</strong>
              </div>
              <div><span>学习数据</span><strong>待接入</strong></div>
            </div>
            <ElAlert
              class="user-detail-page__pending"
              :closable="false"
              title="开放场景、学习天数与收藏统计接口待接入"
              type="warning"
              show-icon
            />
          </ElCard>
        </div>

        <ElCard class="user-detail-page__contact" shadow="never">
          <template #header><h3 class="user-detail-page__panel-title">联系与审计</h3></template>
          <ElAlert
            v-if="controller.sectionStates.value.contact === 'error'"
            :closable="false"
            title="联系方式上游暂时不可用，其他用户区块仍可正常查看"
            type="warning"
            show-icon
          />
          <template v-else>
            <div class="user-detail-page__contact-row">
              <span>微信号</span>
              <SensitiveValue
                :can-copy="contactCapabilities.canCopySensitiveValue"
                :value="controller.detail.value.contact?.wechat_id ?? null"
              />
            </div>
            <div class="user-detail-page__contact-row">
              <span>联系状态</span>
              <strong>{{ controller.detail.value.contact?.contact_status ?? '未提供' }}</strong>
            </div>
          </template>
          <ElAlert
            class="user-detail-page__pending"
            :closable="false"
            title="联系状态更新、敏感复制审计和更正命令接口待接入"
            type="info"
            show-icon
          />
          <div class="user-detail-page__actions">
            <ElButton disabled>更新状态</ElButton>
            <ElButton disabled type="primary">已核对新微信号</ElButton>
          </div>
        </ElCard>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.user-detail-page {
  &__toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  &__toolbar span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  &__toolbar h2,
  &__panel-title {
    margin: 0;
    color: var(--juya-color-sidebar);
  }

  &__toolbar h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  &__panel-title {
    font-size: 15px;
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
    gap: 14px;
  }

  &__column {
    display: grid;
    gap: 14px;
  }

  &__profile {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__avatar {
    display: grid;
    width: 58px;
    height: 58px;
    border-radius: 18px;
    background: #d8eee3;
    color: var(--juya-color-primary);
    font-size: 26px;
    place-items: center;
  }

  &__profile-copy {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  &__profile-copy strong {
    width: 100%;
    font-size: 17px;
  }

  &__profile-copy span {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  &__metrics div {
    min-height: 92px;
    padding: 16px;
    border: 1px solid var(--juya-color-border);
    border-radius: var(--juya-panel-radius);
  }

  &__metrics span,
  &__metrics strong {
    display: block;
  }

  &__metrics span {
    margin-bottom: 8px;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  &__metrics strong {
    color: var(--juya-color-sidebar);
    font-size: 24px;
  }

  &__pending {
    margin-top: 16px;
  }

  &__contact {
    min-height: 390px;
  }

  &__contact-row {
    display: grid;
    gap: 7px;
    margin-bottom: 20px;
  }

  &__contact-row > span {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
  }
}

@media (width <= 1100px) {
  .user-detail-page {
    &__grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

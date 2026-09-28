<script setup lang="ts">
import { WarningFilled } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import { createContactCapabilities } from '@/features/contacts/contact-capabilities'
import { createApiClient } from '@/services/api/api-client'

const route = useRoute()
const correctionId = computed(() => String(route.params.id))
const capabilities = createContactCapabilities(
  createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL })
)
</script>

<template>
  <section class="contact-correction-page">
    <div class="contact-correction-page__heading">
      <div>
        <span>A04</span>
        <h2>联系资料更正申请</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'users' }">
        <ElButton @click="navigate">查看用户列表</ElButton>
      </RouterLink>
    </div>

    <ElAlert
      :closable="false"
      title="联系资料更正详情与处理命令接口尚未提供，当前页面不会发送未知请求"
      type="warning"
      show-icon
    />

    <div class="contact-correction-page__grid">
      <ElCard shadow="never">
        <template #header><h3>申请信息</h3></template>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="申请编号">{{ correctionId }}</ElDescriptionsItem>
          <ElDescriptionsItem label="用户编号">接口待接入</ElDescriptionsItem>
          <ElDescriptionsItem label="原微信号">接口待接入</ElDescriptionsItem>
          <ElDescriptionsItem label="新微信号">接口待接入</ElDescriptionsItem>
          <ElDescriptionsItem label="更正原因">接口待接入</ElDescriptionsItem>
        </ElDescriptions>
        <PendingCapability description="缺少更正申请详情接口，未展示任何模拟用户或联系方式。" />
      </ElCard>

      <ElCard class="contact-correction-page__audit" shadow="never">
        <template #header><h3>联系与审计</h3></template>
        <div class="contact-correction-page__empty-audit">
          <ElIcon><WarningFilled /></ElIcon>
          <strong>审计时间线待接入</strong>
          <span>批准、拒绝、敏感复制审计和联系状态命令均缺少后端接口。</span>
        </div>
        <div class="contact-correction-page__actions">
          <ElTooltip content="拒绝命令接口待接入">
            <span><ElButton disabled>拒绝</ElButton></span>
          </ElTooltip>
          <ElTooltip content="批准命令接口待接入">
            <span><ElButton disabled type="primary">批准并重置修改机会</ElButton></span>
          </ElTooltip>
        </div>
        <p class="contact-correction-page__request-state">
          网络请求状态：{{ capabilities.canCopySensitiveValue ? '可用' : '0 个未知请求' }}
        </p>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.contact-correction-page {
  &__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  &__heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  &__heading h2,
  h3 {
    margin: 0;
    color: var(--juya-color-sidebar);
  }

  &__heading h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  h3 {
    font-size: 15px;
  }

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
    gap: 14px;
    margin-top: 14px;
  }

  &__audit {
    min-height: 390px;
  }

  &__empty-audit {
    display: grid;
    min-height: 205px;
    color: var(--juya-color-text-secondary);
    place-items: center;
    align-content: center;
    gap: 9px;
    text-align: center;
  }

  &__empty-audit .el-icon {
    color: var(--juya-color-warning);
    font-size: 28px;
  }

  &__empty-audit strong {
    color: var(--juya-color-text-primary);
  }

  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  &__actions .el-button,
  &__actions span {
    width: 100%;
  }

  &__request-state {
    margin: 14px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    text-align: center;
  }
}

@media (width <= 1100px) {
  .contact-correction-page {
    &__grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>

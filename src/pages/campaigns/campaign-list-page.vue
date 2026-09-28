<script setup lang="ts">
import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'

const capabilities = createCampaignAdapter()
</script>

<template>
  <section class="campaign-page">
    <ElCard shadow="never">
      <template #header>
        <div class="campaign-page__heading">
          <div>
            <span>A10</span>
            <h2>限时活动列表</h2>
          </div>
          <ElButton :disabled="!capabilities.canManage" type="primary">新建活动</ElButton>
        </div>
      </template>
      <ElAlert
        :closable="false"
        title="活动列表与管理接口尚未提供，当前不会发送未知请求"
        type="warning"
        show-icon
      />
      <div class="campaign-page__filters">
        <ElInput disabled placeholder="活动名称或编号" />
        <ElSelect aria-label="活动状态筛选（待接入）" disabled placeholder="全部状态" />
      </div>
      <PendingCapability description="缺少活动查询接口，未使用本地模拟活动或容量数据。" />
      <p class="campaign-page__request-state">
        网络请求状态：{{ capabilities.requestCount }} 个未知请求
      </p>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.campaign-page {
  &__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  &__heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  &__heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 16px;
  }

  &__filters {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }

  &__filters .el-input {
    width: 240px;
  }

  &__filters .el-select {
    width: 160px;
  }

  &__request-state {
    margin: 0;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    text-align: center;
  }
}
</style>

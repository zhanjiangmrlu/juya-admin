<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { getCampaignFieldAccess } from '@/features/campaigns/campaign-model'

const route = useRoute()
const campaignId = computed(() => String(route.params.id))
const capabilities = createCampaignAdapter()
const fieldAccess = getCampaignFieldAccess({ hasGrantedEntitlements: true })
</script>

<template>
  <section class="campaign-edit-page">
    <div class="campaign-edit-page__heading">
      <div>
        <span>A11</span>
        <h2>限时活动编辑 · {{ campaignId }}</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
        ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
      >
    </div>
    <ElAlert
      :closable="false"
      title="活动详情与保存接口待接入；首次开通后模式、场景顺序和启动窗口必须锁定"
      type="warning"
      show-icon
    />
    <ElCard class="campaign-edit-page__card" shadow="never">
      <ElForm label-position="top">
        <div class="campaign-edit-page__grid">
          <ElFormItem label="活动名称"><ElInput disabled placeholder="接口待接入" /></ElFormItem>
          <ElFormItem label="学习时长"
            ><ElInput
              :disabled="fieldAccess.duration === 'readonly' || !capabilities.canManage"
              placeholder="首次开通后只读"
          /></ElFormItem>
          <ElFormItem label="启动窗口"
            ><ElInput
              :disabled="fieldAccess.activationWindow === 'readonly' || !capabilities.canManage"
              placeholder="首次开通后只读"
          /></ElFormItem>
          <ElFormItem label="容量上限"
            ><ElInput disabled placeholder="容量接口待接入"
          /></ElFormItem>
        </div>
        <ElFormItem label="场景顺序"
          ><ElInput disabled type="textarea" placeholder="首次开通后只读，接口待接入"
        /></ElFormItem>
        <ElButton disabled type="primary">保存活动</ElButton>
      </ElForm>
      <PendingCapability
        description="活动详情、保存和发布能力均为 Pending；页面不会本地生成成功版本。"
      />
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.campaign-edit-page {
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

  &__heading h2 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
    font-size: 18px;
  }

  &__card {
    margin-top: 14px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 14px;
  }
}
</style>

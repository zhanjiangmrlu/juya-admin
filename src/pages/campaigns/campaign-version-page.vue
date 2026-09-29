<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import { createCampaignAdapter } from '@/features/campaigns/campaign-adapter'
import { validateCapacityLimit } from '@/features/campaigns/campaign-model'

const route = useRoute()
const campaignId = computed(() => String(route.params.id))
const capabilities = createCampaignAdapter()
const capacity = ref<number | undefined>()
const capacityValidation = computed(() =>
  capacity.value === undefined ? null : validateCapacityLimit(0, capacity.value)
)
</script>

<template>
  <section class="campaign-version-page">
    <div class="heading">
      <div>
        <span>A12</span>
        <h2>活动版本与容量 · {{ campaignId }}</h2>
      </div>
      <RouterLink v-slot="{ navigate }" custom :to="{ name: 'campaigns' }"
        ><ElButton @click="navigate">返回活动列表</ElButton></RouterLink
      >
    </div>
    <div class="grid">
      <ElCard shadow="never">
        <template #header><h3>版本记录</h3></template>
        <PendingCapability description="活动版本列表接口待接入，未展示模拟版本。" />
      </ElCard>
      <ElCard shadow="never">
        <template #header><h3>容量调整</h3></template>
        <ElAlert
          :closable="false"
          title="容量只能提高或保持，不能低于服务端已开通人数"
          type="info"
          show-icon
        />
        <ElFormItem class="capacity" label="新容量">
          <ElInputNumber v-model="capacity" :disabled="!capabilities.canChangeCapacity" :min="1" />
        </ElFormItem>
        <ElAlert
          v-if="capacityValidation && !capacityValidation.valid"
          :closable="false"
          :title="capacityValidation.message"
          type="error"
        />
        <ElButton disabled type="primary">确认调整容量</ElButton>
        <p>网络请求状态：{{ capabilities.requestCount }} 个未知请求</p>
      </ElCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.campaign-version-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .heading span {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .heading h2,
  h3 {
    margin: 3px 0 0;
    color: var(--juya-color-sidebar);
  }

  .heading h2 {
    font-size: 18px;
  }

  h3 {
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(340px, 2fr);
    gap: 14px;
  }

  .capacity {
    margin-top: 18px;
  }

  p {
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}
</style>

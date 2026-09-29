<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import PendingCapability from '@/components/pending-capability/pending-capability.vue'
import {
  type CapabilityKey,
  type CapabilityState,
  getCapability
} from '@/shared/capabilities/capability-registry'

const route = useRoute()
const capability = computed<CapabilityState>(() =>
  getCapability(route.meta.capability as CapabilityKey)
)
</script>

<template>
  <section class="capability-placeholder-page">
    <div class="heading">
      <div>
        <span class="number">{{ route.meta.pageNumber }}</span>
        <h2 class="title">{{ route.meta.title }}</h2>
      </div>
      <ElTag :type="capability === 'available' ? 'success' : 'warning'" effect="plain">
        {{ capability === 'available' ? '接口已提供' : '接口待接入' }}
      </ElTag>
    </div>

    <ElCard class="panel" shadow="never">
      <PendingCapability
        :description="
          capability === 'available'
            ? '该页面将在对应业务阶段接入现有接口，当前未展示模拟业务数据。'
            : '当前后端未提供此页面所需接口，未知操作保持禁用且不会发送请求。'
        "
        :title="capability === 'available' ? '页面开发中' : '接口待接入'"
      />
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.capability-placeholder-page {
  .heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--juya-space-5);
  }

  .number {
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  .title {
    margin: 4px 0 0;
    font-size: 24px;
    line-height: 1.25;
  }

  .panel {
    min-height: 360px;
  }
}
</style>

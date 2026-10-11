<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { createLearningFeaturesAdapter } from './learning-features-adapter'
import { useLearningFeatures } from './use-learning-features'

const adapter = createLearningFeaturesAdapter(useAdminApiClient())
const controller = useLearningFeatures(adapter)
onMounted(() => {
  if (adapter.available) void controller.load()
})
onBeforeUnmount(controller.dispose)
</script>
<template>
  <AdminPanel title="学习与资料入口审核" class="learning-features-panel">
    <p>
      录音权限独立于跟读学习入口；关闭后仍可阅读、听原音、收藏和完成学习。录音仅在设备本地使用。
    </p>
    <ElAlert
      v-if="!adapter.available"
      title="等待最终学习功能配置契约装配"
      type="info"
      :closable="false"
    />
    <ElAlert
      v-if="controller.error.value"
      :title="controller.error.value"
      type="error"
      :closable="false"
    />
    <ElAlert
      v-if="controller.conflict.value"
      title="配置已变化，本地选择已保留；载入最新版本后重新确认"
      type="warning"
      :closable="false"
    />
    <div class="switch-row">
      <span>允许跟读录音</span>
      <ElSwitch
        v-model="controller.enabled.value"
        aria-label="跟读录音权限"
        :disabled="
          !adapter.available ||
          !controller.snapshot.value ||
          controller.busy.value ||
          controller.conflict.value
        "
      />
    </div>
    <div class="switch-row">
      <span>显示完善资料次级入口</span>
      <ElSwitch
        v-model="controller.profileEnabled.value"
        aria-label="完善资料次级入口"
        :disabled="
          !adapter.available ||
          !controller.snapshot.value ||
          controller.busy.value ||
          controller.conflict.value
        "
      />
    </div>
    <p>完善资料只作为个人中心次级入口，默认关闭；不阻挡阅读、听音或学习完成。</p>
    <div class="actions">
      <ElTag v-if="controller.snapshot.value" effect="plain"
        >学习配置 v{{ controller.snapshot.value.version }}</ElTag
      >
      <ElButton :disabled="!adapter.available || controller.busy.value" @click="controller.load"
        >载入最新学习配置</ElButton
      >
      <ElButton
        type="primary"
        :loading="controller.busy.value"
        :disabled="!controller.snapshot.value || controller.conflict.value"
        @click="controller.save"
        >保存学习与资料入口</ElButton
      >
    </div>
  </AdminPanel>
</template>
<style scoped lang="scss">
.learning-features-panel {
  p {
    color: var(--juya-color-text-secondary);
    font-size: 13px;
  }

  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 16px 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
}
</style>

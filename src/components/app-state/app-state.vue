<script setup lang="ts">
import { ElAlert, ElButton, ElEmpty, ElText } from 'element-plus'

defineProps<{
  elementPlus?: boolean
  busy?: boolean
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyText?: string
}>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <template v-if="elementPlus">
    <ElAlert
      v-if="error"
      class="management-state-error notice error"
      :closable="false"
      type="error"
    >
      {{ error }} <ElButton link @click="$emit('retry')">重试</ElButton>
    </ElAlert>
    <div v-if="busy" class="loading" role="status"><ElText>正在加载…</ElText></div>
    <ElEmpty v-else-if="empty && !error" class="management-empty empty">
      <template #image><span /></template>
      <template #description>
        <h3>{{ emptyTitle || '暂无记录' }}</h3>
        <p>{{ emptyText }}</p>
      </template>
      <slot />
    </ElEmpty>
  </template>
  <template v-else>
    <div v-if="error" class="notice error" role="alert">
      {{ error }} <button type="button" class="text" @click="$emit('retry')">重试</button>
    </div>
    <div v-if="busy" class="loading" role="status">正在加载…</div>
    <div v-else-if="empty && !error" class="empty">
      <h3>{{ emptyTitle || '暂无记录' }}</h3>
      <p>{{ emptyText }}</p>
      <slot />
    </div>
  </template>
</template>
<style scoped lang="scss">
.management-empty {
  :deep([class~='el-empty__image']) {
    display: none;
  }

  :deep([class~='el-empty__description']) {
    margin-top: 0;
  }
}

.management-state-error {
  color: var(--red);
  background: #fff0e8;
}
</style>

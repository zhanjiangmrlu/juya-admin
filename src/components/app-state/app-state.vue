<script setup lang="ts">
defineProps<{
  busy?: boolean
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyText?: string
}>()
defineEmits<{ retry: [] }>()
</script>
<template>
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

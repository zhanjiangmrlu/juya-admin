<script setup lang="ts">
withDefaults(
  defineProps<{
    description?: string
    title?: string
  }>(),
  {
    description: '后端接口尚未提供，当前页面不会发送未知请求。',
    title: '接口待接入'
  }
)
</script>

<template>
  <ElResult icon="info" :sub-title="description" :title="title">
    <template #extra>
      <ElTag effect="plain" type="warning">Pending</ElTag>
    </template>
  </ElResult>
</template>

<script setup lang="ts">
defineProps<{ content: string }>()
</script>

<template>
  <div class="plain-text">
    <span class="content">{{ content }}</span>
  </div>
</template>

<style scoped lang="scss">
.plain-text {
  .content {
    display: block;
    overflow-wrap: anywhere;
    color: var(--juya-color-text-primary);
    line-height: 1.75;
    white-space: pre-wrap;
  }
}
</style>

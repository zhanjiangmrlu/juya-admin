<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <aside class="admin-notice">
    <strong>{{ title }}</strong>
    <slot />
  </aside>
</template>

<style scoped lang="scss">
.admin-notice {
  padding: var(--juya-space-4);
  border-radius: var(--juya-notice-radius);
  background: var(--juya-color-primary-soft);
  font-size: 13px;
  line-height: 1.8;

  strong {
    color: var(--juya-color-brand-accent);
    font-size: 14px;
  }

  :slotted(p) {
    margin: 20px 0 0;
  }
}
</style>

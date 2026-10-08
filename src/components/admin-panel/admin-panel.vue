<script setup lang="ts">
import { ElCard } from 'element-plus'

import { ADMIN_UI_DEFAULTS } from '@/app/admin-ui.config'

withDefaults(
  defineProps<{
    title?: string
    description?: string
    heading?: 2 | 3 | 4
    titleClass?: string
    shadow?: 'always' | 'hover' | 'never'
  }>(),
  {
    title: undefined,
    description: undefined,
    titleClass: undefined,
    heading: ADMIN_UI_DEFAULTS.panel.heading,
    shadow: ADMIN_UI_DEFAULTS.panel.shadow
  }
)
</script>

<template>
  <ElCard class="admin-panel" :shadow="shadow">
    <template v-if="$slots.header || title || $slots['header-actions']" #header>
      <slot name="header">
        <div class="admin-panel-heading">
          <component :is="`h${heading}`" class="admin-panel-title" :class="titleClass">{{
            title
          }}</component>
          <slot name="header-actions" />
        </div>
        <p v-if="description" class="admin-panel-description">{{ description }}</p>
      </slot>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </ElCard>
</template>

<style scoped lang="scss">
.admin-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--juya-space-4);
}

.admin-panel-title {
  margin: 0;
  color: var(--juya-panel-title-color, var(--juya-color-text-primary));
  font-size: var(--juya-panel-title-size, 20px);
  line-height: var(--juya-panel-title-line-height, 30px);
}

.admin-panel-description {
  margin: 8px 0 0;
  color: var(--juya-color-text-secondary);
  font-size: 13px;
}
</style>

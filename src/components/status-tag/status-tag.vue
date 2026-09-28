<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    tone?: 'danger' | 'info' | 'success' | 'warning'
  }>(),
  { tone: 'info' }
)

const tagType = computed(() => (props.tone === 'info' ? undefined : props.tone))
</script>

<template>
  <ElTag :type="tagType" effect="light" round>{{ label }}</ElTag>
</template>

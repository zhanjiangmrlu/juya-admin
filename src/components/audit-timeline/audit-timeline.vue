<script setup lang="ts">
export interface FeedbackTimelineItem {
  actor: string
  at: string
  content: string
  id: string
}

defineProps<{ items: FeedbackTimelineItem[] }>()
</script>

<template>
  <ElTimeline v-if="items.length" class="audit-timeline">
    <ElTimelineItem v-for="item in items" :key="item.id" :timestamp="item.at" placement="top">
      <strong>{{ item.content }}</strong>
      <span>{{ item.actor }}</span>
    </ElTimelineItem>
  </ElTimeline>
  <ElEmpty v-else description="时间线接口待接入" />
</template>

<style scoped lang="scss">
.audit-timeline {
  padding-left: 4px;

  strong,
  span {
    display: block;
  }

  strong {
    color: var(--juya-color-text-primary);
  }

  span {
    margin-top: 4px;
    color: var(--juya-color-text-secondary);
    font-size: 11px;
  }
}
</style>

<script setup lang="ts">
withDefaults(defineProps<{ name?: string; titleEn?: string | null; showMissing?: boolean }>(), {
  name: '',
  titleEn: '',
  showMissing: true
})
</script>
<template>
  <span class="scene-title">
    <span class="chinese">{{ name || '未命名草稿' }}</span>
    <span v-if="titleEn" class="english">{{ titleEn }}</span>
    <span v-else-if="showMissing" class="missing">待补英文标题</span>
  </span>
</template>
<style scoped lang="scss">
.scene-title {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  text-align: left;

  .chinese,
  .english,
  .missing {
    display: block;
    line-height: 1.6;
  }

  .english,
  .missing {
    margin-top: 4px;
    color: var(--muted);
    font-weight: 400;
  }

  .missing {
    font-size: 12px;
  }
}
</style>

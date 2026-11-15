<script setup lang="ts">
import { ElRadio, ElRadioGroup } from 'element-plus'
import { computed } from 'vue'

import {
  type ContentType,
  contentTypeLabels,
  typeIssue
} from '@/features/content-catalog/content-catalog-model'
const type = defineModel<ContentType | null | undefined>({ required: true })
const props = defineProps<{
  hasPdf: boolean
  blocked?: boolean
  disabled?: boolean
  raw?: string[]
}>()
const issue = computed(() => typeIssue(type.value, props.hasPdf, props.blocked))
</script>
<template>
  <section class="content-type">
    <strong>内容类型 *</strong
    ><ElRadioGroup
      :model-value="type || undefined"
      aria-label="内容类型"
      :disabled="disabled"
      @update:model-value="type = $event as ContentType"
      ><ElRadio v-for="(label, value) in contentTypeLabels" :key="value" :value="value">{{
        label
      }}</ElRadio></ElRadioGroup
    >
    <p class="muted small">精读词汇须配有效PDF；添加或移除PDF不会自动改变内容类型。</p>
    <p v-if="raw?.length" class="small">文件原始类型：{{ raw.join('、') }}</p>
    <p v-if="issue" class="notice" role="status">{{ issue }}</p>
  </section>
</template>
<style scoped lang="scss">
.content-type {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
  margin: 18px 0;

  .el-radio-group {
    display: flex;
    margin-top: 12px;
  }

  p {
    margin: 10px 0 0;
  }
}
</style>

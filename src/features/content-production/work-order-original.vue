<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import { originalParagraphs } from './work-order-model'
defineProps<{ snapshot: Record<string, unknown> | null }>()
</script>
<template>
  <AdminPanel title="原始文档 · 只读" class="original-document"
    ><ElAlert
      v-if="!snapshot"
      title="未保留可验证的原始正文"
      description="请补充原始文件后核对。当前草稿仍可编辑，但不能作为原文确认依据。"
      type="warning"
      :closable="false"
    /><template v-else
      ><ElTag type="info">原文保留</ElTag>
      <article
        v-for="(paragraph, index) in originalParagraphs(snapshot)"
        :key="index"
        :data-source-location="paragraph.sourceKey || paragraph.locator"
        :data-source-aliases="paragraph.sourceAliases?.join(' ')"
      >
        <small>{{ paragraph.locator }}</small>
        <p>{{ paragraph.text }}</p>
      </article></template
    ></AdminPanel
  >
</template>
<style scoped lang="scss">
.original-document {
  align-self: start;

  article {
    padding: 12px 0;
    border-bottom: 1px solid var(--juya-color-border);

    &[data-source-highlight='true'] {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 3px;
    }

    p {
      white-space: pre-wrap;
      line-height: 1.9;
      margin: 6px 0;
    }

    small {
      color: var(--juya-color-text-regular);
    }
  }
}
</style>

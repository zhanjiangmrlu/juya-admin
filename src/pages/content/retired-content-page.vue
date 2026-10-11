<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
</script>

<template>
  <AdminPanel title="OCR 功能已取消">
    <p>历史已确认正文与素材保留。请通过内容导入或草稿编辑维护完整中英文，不再提取图片文字。</p>
    <RouterLink :to="{ name: 'content-import' }"
      ><ElButton type="primary">进入内容生产</ElButton></RouterLink
    >
  </AdminPanel>
</template>

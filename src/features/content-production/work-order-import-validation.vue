<script setup lang="ts">
import { computed } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S } from './work-order-model'
const props = defineProps<{ preview: S['ImportPreview']; busy: boolean }>()
const emit = defineEmits<{ exclude: [id: string] }>()
const rows = computed(() =>
  props.preview.items.flatMap((item) => item.issues.map((issue) => ({ item, issue })))
)
const eligible = computed(
  () =>
    props.preview.items.filter(
      (item) =>
        !['SUCCESS', 'CANCELLED'].includes(item.status) &&
        !item.issues.some((issue) => issue.severity === 'ERROR')
    ).length
)
</script>
<template>
  <div class="import-validation">
    <AdminPanel
      :title="`${eligible} 篇可进入对应预览，${preview.items.filter((item) => item.issues.length).length} 行需要处理`"
    >
      <p>按表格行与导入 ID 定位问题，修正原文件或明确排除；不会静默跳过</p>
      <ElAlert
        v-for="issue in preview.batch_issues"
        :key="issue.id"
        :title="issue.message"
        type="error"
        :closable="false"
      />
      <ElTable :data="rows" empty-text="当前没有行级问题，可继续核对对应资料">
        <ElTableColumn label="表格行 / 内容 ID" min-width="260"
          ><template #default="{ row }"
            >第 {{ row.item.row_no }} 行 · {{ row.item.import_content_id }}</template
          ></ElTableColumn
        >
        <ElTableColumn label="问题" min-width="360"
          ><template #default="{ row }">{{ row.issue.message }}</template></ElTableColumn
        >
        <ElTableColumn label="处理动作" min-width="240"
          ><template #default="{ row }"
            ><span v-if="row.item.status === 'CANCELLED'">已排除</span
            ><ElButton
              v-else-if="row.item.status !== 'SUCCESS'"
              link
              type="primary"
              :disabled="busy"
              @click="emit('exclude', row.item.item_id)"
              >排除此行</ElButton
            ><span v-else>成功结果保留，请修正候选正文或素材</span></template
          ></ElTableColumn
        >
      </ElTable>
      <p v-if="preview.unreferenced_files?.length">
        未引用文件 {{ preview.unreferenced_files.length }} 个：{{
          preview.unreferenced_files.join('、')
        }}
      </p>
    </AdminPanel>
    <ElAlert title="缺图与音频，按内容类型处理" type="info" :closable="false"
      >词汇未提供图片可确认无图；语块不收图片。短文无全文音频可通过。已填写的错误路径必须修正或明确清空；排除范围需管理员确认。</ElAlert
    >
  </div>
</template>
<style scoped lang="scss">
.import-validation {
  display: grid;
  gap: 20px;

  p {
    color: var(--juya-color-text-regular);
    line-height: 22px;
  }
}
</style>

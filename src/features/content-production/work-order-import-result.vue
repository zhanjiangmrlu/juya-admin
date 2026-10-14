<script setup lang="ts">
import { computed } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S } from './work-order-model'
const props = defineProps<{ preview: S['ImportPreview']; busy: boolean }>()
const emit = defineEmits<{ edit: [id: string]; retry: [] }>()
const unresolved = computed(() =>
  props.preview.items.some(
    (row) => row.status !== 'CANCELLED' && !['SUCCESS', 'FAILED'].includes(row.result?.status || '')
  )
)
const counts = computed(() => ({
  created: props.preview.items.filter(
    (row) => row.result?.status === 'SUCCESS' && row.result.operation === 'CREATE'
  ).length,
  updated: props.preview.items.filter(
    (row) => row.result?.status === 'SUCCESS' && row.result.operation === 'UPDATE_DRAFT'
  ).length,
  skipped: props.preview.items.filter(
    (row) => row.result?.status === 'SUCCESS' && row.result.operation === 'SKIP'
  ).length,
  failed: props.preview.items.filter((row) => row.result?.status === 'FAILED').length,
  excluded: props.preview.items.filter((row) => row.status === 'CANCELLED').length
}))
const labels: Record<string, string> = {
  CREATE: '新增草稿已保存',
  UPDATE_DRAFT: '候选版本已保存，线上版本保持原样',
  SKIP: '相同资料已跳过'
}
</script>
<template>
  <div class="import-result">
    <AdminPanel :title="`${counts.created + counts.updated} 篇草稿已保存`"
      ><p>
        新增 {{ counts.created }} 篇 · 候选更新 {{ counts.updated }} 篇 · 跳过
        {{ counts.skipped }} 篇 · 失败 {{ counts.failed }} 篇 · 排除 {{ counts.excluded }} 篇
      </p>
      <ElTable :data="preview.items"
        ><ElTableColumn
          prop="import_content_id"
          label="内容导入 ID"
          min-width="280"
        /><ElTableColumn label="处理结果" min-width="370"
          ><template #default="{ row }">{{
            row.status === 'CANCELLED'
              ? '已明确排除'
              : row.result?.status === 'SUCCESS'
                ? labels[row.result.operation] || '成功结果待核实'
                : row.result?.status === 'FAILED'
                  ? '保存失败，成功结果已保留'
                  : '结果待核实，请刷新本批'
          }}</template></ElTableColumn
        ><ElTableColumn label="后续动作" min-width="240"
          ><template #default="{ row }"
            ><ElButton
              v-if="row.result?.status === 'SUCCESS' && row.result.revision_id"
              link
              type="primary"
              @click="emit('edit', row.item_id)"
              >查看正文与校对</ElButton
            ><ElButton
              v-else-if="row.result?.status === 'FAILED'"
              link
              type="primary"
              :disabled="busy"
              @click="emit('retry')"
              >核对后仅重试失败篇目</ElButton
            ></template
          ></ElTableColumn
        ></ElTable
      >
    </AdminPanel>
    <ElAlert
      :title="unresolved ? '导入结果待核实，尚未发布' : '导入完成，尚未发布'"
      type="info"
      :closable="false"
      >成功草稿和原线上版本保留；失败阶段可单独重试。进入正常抽样和异常校对后，发布仍需另行明确确认。</ElAlert
    >
  </div>
</template>
<style scoped lang="scss">
.import-result {
  display: grid;
  gap: 20px;

  p {
    color: var(--juya-color-text-regular);
    line-height: 22px;
  }
}
</style>

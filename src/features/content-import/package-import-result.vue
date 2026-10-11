<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ImportBatch } from './content-package-model'

defineProps<{ batch: ImportBatch; busy: boolean }>()
const emit = defineEmits<{ retry: []; refresh: []; cancel: [] }>()
const statusLabels: Record<string, string> = {
  SUCCESS: '草稿已保存',
  COMPLETED: '草稿已保存',
  FAILED: '失败',
  SKIPPED: '相同内容跳过',
  EXCLUDED: '已排除',
  PENDING: '等待处理',
  RUNNING: '处理中',
  READY: '待确认'
}
</script>
<template>
  <AdminPanel title="草稿保存结果">
    <ElAlert
      :title="
        batch.status === 'FAILED'
          ? '当前批次处理失败，请读取实际失败阶段后明确恢复'
          : '保存草稿不会发布；成功项继续进入校对与发布'
      "
      :type="batch.status === 'FAILED' ? 'error' : 'info'"
      :closable="false"
    />
    <div class="result-counts">
      <span>成功 {{ batch.counts.success }}</span
      ><span>失败 {{ batch.counts.failed }}</span
      ><span>跳过 {{ batch.counts.skipped }}</span
      ><span>排除 {{ batch.counts.excluded }}</span>
    </div>
    <ElTable :data="batch.items"
      ><ElTableColumn prop="title" label="内容标题" min-width="180" /><ElTableColumn
        label="结果"
        min-width="110"
        ><template #default="{ row }">{{
          statusLabels[row.status] || row.status
        }}</template></ElTableColumn
      ><ElTableColumn label="阶段 / 说明" min-width="220"
        ><template #default="{ row }">{{ row.stage }} {{ row.error }}</template></ElTableColumn
      ><ElTableColumn label="后续操作" min-width="140"
        ><template #default="{ row }"
          ><RouterLink
            v-if="row.contentId"
            :to="{
              name:
                row.contentType === 'short_reading'
                  ? 'content-short-reading-edit'
                  : 'content-scene-edit',
              params: { id: row.contentId }
            }"
            >编辑与校对</RouterLink
          ></template
        ></ElTableColumn
      ></ElTable
    >
    <div class="actions">
      <ElButton :loading="busy" @click="emit('refresh')">刷新任务结果</ElButton
      ><ElButton
        :disabled="
          busy ||
          !(batch.status === 'FAILED' || batch.items.some((item) => item.status === 'FAILED'))
        "
        @click="emit('retry')"
        >查看失败阶段并恢复</ElButton
      ><ElButton :disabled="busy || batch.status === 'COMPLETED'" @click="emit('cancel')"
        >取消未开始项</ElButton
      ><RouterLink :to="{ name: 'content-scenes' }">前往内容列表</RouterLink>
    </div>
  </AdminPanel>
</template>
<style scoped lang="scss">
.result-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 22px 0;

  span {
    flex: 1;
    min-width: 100px;
    padding: 18px;
    border-radius: 12px;
    background: var(--juya-color-surface);
    font-weight: 600;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
</style>

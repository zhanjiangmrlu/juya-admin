<script setup lang="ts">
import {
  ElButton,
  ElCheckbox,
  ElDialog,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn
} from 'element-plus'
import { ref, watch } from 'vue'

import {
  type ContentType,
  contentTypeLabels
} from '@/features/content-catalog/content-catalog-model'
import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch } from '@/shared/types/import'
const props = defineProps<{
  batchId: string
  items: { id: string; revision: number }[]
  disabled?: boolean
  flush: () => Promise<boolean>
}>()
const emit = defineEmits<{ applied: [batch: ImportBatch] }>()
const contentType = ref<ContentType>('illustrated'),
  overwrite = ref(false),
  preview = ref<components['schemas']['TypePreview'] | null>(null),
  busy = ref(false),
  error = ref('')
let pending: (() => Promise<ImportBatch>) | null = null
watch(
  () => [props.items, contentType.value, overwrite.value],
  () => {
    preview.value = null
    pending = null
  },
  { deep: true }
)
/** 暂存已有修改后展示服务器冻结的影响范围、旧值和PDF冲突 */
const inspect = async () => {
  if (busy.value || props.disabled || !props.items.length) return
  busy.value = true
  error.value = ''
  try {
    if (!(await props.flush())) throw new Error('请先解决暂存失败后重新预览')
    const body = {
      items: props.items.map((item) => ({ ...item })),
      content_type: contentType.value,
      overwrite: overwrite.value
    }
    preview.value = await api.request<components['schemas']['TypePreview']>(
      `/api/admin/v1/imports/${encodeURIComponent(props.batchId)}/content-types/preview`,
      { method: 'POST', body }
    )
    pending = api.operation(
      'POST',
      `/api/admin/v1/imports/${encodeURIComponent(props.batchId)}/content-types/apply`,
      { ...body, version: preview.value.version }
    )
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
/** 管理员确认已展示范围后应用，未知结果保留原操作键 */
const apply = async () => {
  if (!pending || busy.value) return
  busy.value = true
  error.value = ''
  try {
    emit('applied', await pending())
    preview.value = null
    pending = null
  } catch (reason) {
    error.value = (reason as Error).message
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="type-batch">
    <span>已选 {{ items.length }} 张可编辑候选</span
    ><ElSelect v-model="contentType" aria-label="批量内容类型" :disabled="busy"
      ><ElOption
        v-for="(label, value) in contentTypeLabels"
        :key="value"
        :label="label"
        :value="value" /></ElSelect
    ><ElCheckbox v-model="overwrite" :disabled="busy">明确覆盖已有类型</ElCheckbox
    ><ElButton :disabled="disabled || busy || !items.length" @click="inspect">批量指定类型</ElButton
    ><small>默认仅补空值；重复候选不参与</small>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ElDialog
      :model-value="!!preview"
      title="核对批量类型变更"
      width="850px"
      :close-on-click-modal="false"
      :show-close="!busy"
      :close-on-press-escape="!busy"
      @close="
        () => {
          preview = null
          pending = null
        }
      "
      ><p v-if="error" class="error" role="alert">{{ error }}</p>
      <p>将改变 {{ preview?.count }} 张候选，确认后按候选版本应用。</p>
      <ElTable :data="preview?.items || []"
        ><ElTableColumn prop="id" label="稳定候选ID" /><ElTableColumn label="原值"
          ><template #default="{ row }">{{
            row.old_type ? contentTypeLabels[row.old_type as ContentType] : '未填写'
          }}</template></ElTableColumn
        ><ElTableColumn label="新值"
          ><template #default="{ row }">{{
            contentTypeLabels[row.new_type as ContentType]
          }}</template></ElTableColumn
        ><ElTableColumn label="PDF冲突"
          ><template #default="{ row }">{{
            row.pdf_conflict ? '冲突，须修正后发布' : '无冲突'
          }}</template></ElTableColumn
        ></ElTable
      ><template #footer
        ><ElButton
          :disabled="busy"
          @click="
            () => {
              preview = null
              pending = null
            }
          "
          >取消</ElButton
        ><ElButton :disabled="busy || !preview?.count" @click="apply"
          >确认应用类型</ElButton
        ></template
      ></ElDialog
    >
  </section>
</template>
<style scoped lang="scss">
.type-batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 18px;
  background: var(--soft);
  border-radius: 10px;
  margin: 18px 0;

  .el-select {
    width: 160px;
  }

  .error {
    width: 100%;
  }
}
</style>

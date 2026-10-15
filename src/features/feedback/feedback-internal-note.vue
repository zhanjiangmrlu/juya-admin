<script setup lang="ts">
import { ElMessage } from 'element-plus'

import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { createFeedbackAdapter } from './feedback-adapter'
import { useFeedbackNote } from './use-feedback-note'

const props = defineProps<{ ticketId: string }>()
const emit = defineEmits<{ updated: [] }>()
const note = useFeedbackNote(createFeedbackAdapter(useAdminApiClient()), props.ticketId)
/** 保存管理员备注，失败保留原输入 */
const save = async (): Promise<void> => {
  try {
    await note.submit()
    ElMessage.success('内部备注已保存')
    emit('updated')
  } catch {
    /* 控制器保留输入并展示错误 */
  }
}
</script>
<template>
  <div class="feedback-internal-note">
    <ElForm label-position="top"
      ><ElFormItem label="内部备注 · 仅管理员可见"
        ><ElInput
          :model-value="note.draft.value"
          placeholder="最多 200 字，仅管理员可见"
          maxlength="200"
          @update:model-value="note.setDraft" /></ElFormItem></ElForm
    ><ElAlert
      v-if="note.error.value"
      :title="note.error.value"
      type="error"
      :closable="false"
    /><ElButton
      link
      :disabled="!note.draft.value.trim()"
      :loading="note.isSubmitting.value"
      @click="save"
      >保存内部备注</ElButton
    >
  </div>
</template>
<style scoped lang="scss">
.feedback-internal-note {
  margin-top: 16px;

  :deep(.el-form-item) {
    margin-bottom: 0;
  }
}
</style>

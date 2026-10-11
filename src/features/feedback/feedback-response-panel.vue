<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, reactive, shallowRef, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import ApiErrorDetails from '@/components/api-error-details/api-error-details.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { FeedbackTicket } from './feedback-adapter'

import { createFeedbackAdapter } from './feedback-adapter'
import { getFeedbackOperations } from './feedback-model'
import { useFeedbackCommand } from './use-feedback-command'
import { useFeedbackNote } from './use-feedback-note'

const props = defineProps<{ ticket: FeedbackTicket }>()
const emit = defineEmits<{ updated: [] }>()
const adapter = createFeedbackAdapter(useAdminApiClient())
const current = shallowRef<FeedbackTicket | null>(props.ticket)
const command = useFeedbackCommand(adapter, current)
const note = useFeedbackNote(adapter, props.ticket.id)
const form = reactive({ template: '', text: '' })
const operations = computed(() => (current.value ? getFeedbackOperations(current.value) : []))
watch(
  () => props.ticket,
  (ticket) => {
    current.value = ticket
  }
)
onBeforeUnmount(() => {
  current.value = null
})

const /**
   * 发送当前模板及说明，失败保留输入；action 为处理、关闭或要求补充
   * @param action - 本次选择的反馈处理命令
   */
  submit = async (action: 'resolve' | 'close' | 'supplement' | 'start'): Promise<void> => {
    try {
      if (action === 'start') await command.start()
      else if (action === 'supplement') await command.requestSupplement(form.text)
      else if (action === 'close') await command.close(form.text)
      else await command.resolve({ template: form.template, note: form.text })
      ElMessage.success('反馈处理结果已保存')
      emit('updated')
    } catch {
      /* 命令控制器显示真实错误且保留草稿 */
    }
  }
const /** 保存管理员内部备注 */
  saveNote = async (): Promise<void> => {
    try {
      await note.submit()
      ElMessage.success('内部备注已保存')
      emit('updated')
    } catch {
      /* 保留原输入 */
    }
  }
</script>

<template>
  <AdminPanel title="回复与处理结果" class="feedback-response-panel">
    <ElAlert v-if="command.error.value" :title="command.error.value" type="error" :closable="false"
      ><ApiErrorDetails :error="command.apiError.value" />
      <p v-if="command.hasConflict.value">状态已变化，输入已保留，请刷新详情再核对</p></ElAlert
    >
    <ElForm label-position="top">
      <ElFormItem label="结果模板" required>
        <ElSelect v-model="form.template" placeholder="选择处理结果">
          <ElOption label="已处理" value="RESOLVED" />
          <ElOption label="暂无法处理" value="TEMPORARILY_UNAVAILABLE" />
          <ElOption label="需要补充" value="NEED_MORE" />
          <ElOption label="信息不足无法处理" value="CLOSED_INSUFFICIENT" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="补充说明 · 最多200字"
        ><ElInput
          v-model="form.text"
          aria-label="回复补充说明"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
      /></ElFormItem>
      <div class="actions">
        <ElButton
          v-if="operations.includes('START')"
          :loading="command.isSubmitting.value"
          @click="submit('start')"
          >开始处理</ElButton
        >
        <ElButton
          v-if="operations.includes('RESOLVE')"
          :disabled="!['RESOLVED', 'TEMPORARILY_UNAVAILABLE'].includes(form.template)"
          :loading="command.isSubmitting.value"
          type="primary"
          @click="submit('resolve')"
          >回复并标记已处理</ElButton
        >
        <ElButton
          v-if="operations.includes('CLOSE')"
          :disabled="form.template !== 'CLOSED_INSUFFICIENT' || !form.text.trim()"
          :loading="command.isSubmitting.value"
          @click="submit('close')"
          >回复并关闭</ElButton
        >
        <ElButton
          v-if="operations.includes('REQUEST_SUPPLEMENT')"
          :disabled="form.template !== 'NEED_MORE' || !form.text.trim()"
          :loading="command.isSubmitting.value"
          @click="submit('supplement')"
          >要求补充</ElButton
        >
      </div>
      <p>要求补充将进入“需要补充”，等待期间暂停时限。请求失败保留输入。</p>
      <ElEmpty
        v-if="!operations.length"
        description="当前反馈已结束，无可执行操作"
        :image-size="48"
      />
      <ElFormItem label="内部备注 · 仅管理员可见"
        ><ElInput
          :model-value="note.draft.value"
          placeholder="最多 200 字，仅管理员可见"
          type="textarea"
          maxlength="200"
          @update:model-value="note.setDraft"
      /></ElFormItem>
      <ElAlert v-if="note.error.value" :title="note.error.value" type="error" :closable="false" />
      <ElButton
        :disabled="!note.draft.value.trim()"
        :loading="note.isSubmitting.value"
        @click="saveNote"
        >保存内部备注</ElButton
      >
    </ElForm>
  </AdminPanel>
</template>

<style scoped lang="scss">
.feedback-response-panel {
  min-width: 0;

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  p {
    font-size: 12px;
    line-height: 1.8;
    color: var(--juya-color-text-secondary);
  }
}
</style>

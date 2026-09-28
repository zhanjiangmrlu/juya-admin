<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    afterStatus: string
    beforeStatus: string
    confirmLabel?: string
    impactScope: string
    modelValue: boolean
    objectId: string
    reasonRequired?: boolean
    title: string
  }>(),
  {
    confirmLabel: '确认执行',
    reasonRequired: true
  }
)

const emit = defineEmits<{
  cancel: []
  confirm: [reason: string]
  'update:modelValue': [value: boolean]
}>()

const reason = ref('')
const isConfirmDisabled = computed(() => props.reasonRequired && reason.value.trim().length === 0)

watch(
  () => props.modelValue,
  (isVisible) => {
    if (isVisible) reason.value = ''
  }
)

/**
 * 关闭确认弹窗并通知调用方取消操作。
 *
 * @returns 无返回值。
 */
function cancel(): void {
  emit('update:modelValue', false)
  emit('cancel')
}

/**
 * 校验操作原因后向调用方提交确认事件。
 *
 * @returns 无返回值。
 */
function confirm(): void {
  if (isConfirmDisabled.value) return
  emit('confirm', reason.value.trim())
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    align-center
    destroy-on-close
    @close="cancel"
  >
    <ElAlert
      :closable="false"
      title="这是高风险操作，请核对对象和影响范围"
      type="warning"
      show-icon
    />

    <ElDescriptions class="confirm-dialog__summary" :column="1" border>
      <ElDescriptionsItem label="对象编号">{{ objectId }}</ElDescriptionsItem>
      <ElDescriptionsItem label="状态变化">
        <span>{{ beforeStatus }}</span>
        <span class="confirm-dialog__arrow">→</span>
        <strong>{{ afterStatus }}</strong>
      </ElDescriptionsItem>
      <ElDescriptionsItem label="影响范围">{{ impactScope }}</ElDescriptionsItem>
    </ElDescriptions>

    <ElForm label-position="top">
      <ElFormItem :label="reasonRequired ? '操作原因（必填）' : '操作原因（选填）'">
        <ElInput
          v-model="reason"
          :maxlength="200"
          placeholder="请输入可审计的操作原因"
          resize="none"
          show-word-limit
          type="textarea"
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="cancel">取消</ElButton>
      <ElButton :disabled="isConfirmDisabled" type="primary" @click="confirm">
        {{ confirmLabel }}
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.confirm-dialog {
  &__summary {
    margin: 16px 0;
  }

  &__arrow {
    margin: 0 10px;
    color: var(--juya-color-text-secondary);
  }
}
</style>

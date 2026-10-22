<script setup lang="ts">
import { computed } from 'vue'

import { FEEDBACK_STATUS_LABELS } from '@/shared/constants/feedback'

import type { FeedbackStatus } from '@/shared/types/feedback'
const props = defineProps<{
  text: string
  status: FeedbackStatus | ''
  current: FeedbackStatus
  busy: boolean
  blocked: boolean
}>()
defineEmits<{
  'update:text': [value: string]
  'update:status': [value: FeedbackStatus | '']
  send: []
}>()
const count = computed(() => Array.from(props.text.trim()).length)
const valid = computed(
  () =>
    count.value <= 500 &&
    (count.value > 0 || props.status === 'processing') &&
    !props.busy &&
    !props.blocked
)
const label = computed(() =>
  props.status === 'needs_info'
    ? '发送并要求补充'
    : props.status === 'resolved'
      ? '发送并标记已处理'
      : props.status === 'processing'
        ? '开始处理'
        : '发送回复'
)
</script>
<template>
  <form class="panel feedback-handle" @submit.prevent="$emit('send')">
    <h2>回复与处理</h2>
    <div class="status-grid" aria-label="明确处理动作">
      <button
        v-for="(statusLabel, value) in FEEDBACK_STATUS_LABELS"
        :key="value"
        type="button"
        :data-status="value"
        :disabled="value === 'pending' || busy || blocked"
        :aria-pressed="status === value"
        :class="{ current: current === value }"
        @click="$emit('update:status', status === value ? '' : value)"
      >
        {{ statusLabel }}
      </button>
    </div>
    <p class="reply-help">
      要求补充及标记已处理时请填写说明。用户追加说明后重新待处理。普通回复保留当前状态。
    </p>
    <label for="feedback-reply">回复内容</label>
    <textarea
      id="feedback-reply"
      :value="text"
      :disabled="busy || blocked"
      rows="8"
      placeholder="请填写回复，方便用户继续核对。"
      @input="$emit('update:text', ($event.target as HTMLTextAreaElement).value)"
    />
    <p class="reply-count" :class="{ invalid: count > 500 }">{{ count }}／500</p>
    <p v-if="['needs_info', 'resolved'].includes(status) && !count" class="small muted">
      此动作需要填写说明或回复
    </p>
    <button type="submit" class="primary block" data-action="send-feedback" :disabled="!valid">
      {{ busy ? '正在确认…' : label }}
    </button>
  </form>
</template>
<style scoped lang="scss">
.feedback-handle {
  align-self: start;

  h2 {
    font-weight: 700;
    line-height: 28px;
    margin-bottom: 10px;
  }

  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .status-grid button {
    min-height: 44px;
  }

  .status-grid :where(button).current {
    background: var(--soft);
  }

  .status-grid :where(button)[aria-pressed='true'] {
    border-color: var(--green);
    background: var(--soft);
  }

  .reply-help {
    margin: 20px 0 24px;
    color: var(--muted);
    font-size: 13px;
    line-height: 22px;
  }

  label {
    display: block;
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 10px;
  }

  textarea {
    min-height: 220px;
    resize: vertical;
  }

  .reply-count {
    text-align: right;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 16px;
  }

  .reply-count.invalid {
    color: var(--red);
  }
}
</style>

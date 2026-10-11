<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { createUserAdapter } from '@/features/users/user-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
import { formatDateTime } from '@/shared/utils/date-time'

const props = defineProps<{
  before: {
    status: string
    grantedAt?: string
    expiresAt: string | null
    startDeadline?: string
    term?: string
  } | null
  after: {
    status: string
    grantedAt?: string
    expiresAt: string | null
    startDeadline?: string
    term?: string
  }
  actualOperation: string
  userLabel: string
  userId: string
  contentLabel: string
  submitting: boolean
  reasonRequired: boolean
  error?: string | null
  expectedVersion: number
  objectId: string
}>()
const opened = defineModel<boolean>({ required: true })
const note = defineModel<string>('reason', { default: '' })
const users = createUserAdapter(useAdminApiClient())
const identity = ref('')
let userRequest: globalThis.AbortController | null = null
let userSequence = 0
watch(
  () => [opened.value, props.userId],
  async () => {
    const sequence = ++userSequence
    userRequest?.abort()
    identity.value = ''
    if (!opened.value || !props.userId) return
    userRequest = new globalThis.AbortController()
    try {
      const user = await users.getUserDetail(props.userId, userRequest.signal)
      if (sequence === userSequence)
        identity.value = [user.nickname || '未设置昵称', user.juya_number || user.user_id].join(
          ' · '
        )
    } catch {
      /* 无可读取投影时保留预览核验的稳定用户编号 */
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  userSequence++
  userRequest?.abort()
})
const emit = defineEmits<{ confirm: [reason: string] }>()
const reasonType = ref('运营调整')
const statusLabels: Record<string, string> = {
  ACTIVE: '有效',
  PAUSED: '已暂停',
  REVOKED: '已撤销',
  EXPIRED: '已到期',
  PENDING: '待开始',
  ENDED: '已结束',
  START_EXPIRED: '启动窗口已过期'
}
const operationLabels: Record<string, string> = {
  GRANT: '开通',
  RENEW: '续期',
  REGRANT: '重新开通',
  CONVERT_PERMANENT: '转为永久',
  PAUSE: '暂停',
  RESUME: '恢复',
  REVOKE: '撤销',
  REMEDY: '补救',
  EXTEND_START_DEADLINE: '延长启动截止',
  RESTORE_START_WINDOW: '恢复启动窗口'
}
const actualLabel = computed(() => operationLabels[props.actualOperation] || props.actualOperation)
const invalid = computed(
  () => props.reasonRequired && reasonType.value === '其他' && !note.value.trim()
)
const /** 核对原因后发出当前预览的确认 */ confirm = (): void => {
    if (invalid.value || props.submitting) return
    emit(
      'confirm',
      props.reasonRequired
        ? `${reasonType.value}${note.value.trim() ? `：${note.value.trim()}` : ''}`
        : note.value.trim()
    )
  }
</script>
<template>
  <ElDialog
    v-model="opened"
    :title="`确认${actualLabel}`"
    width="min(620px, 94vw)"
    align-center
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <div class="preview-dialog">
      <p class="identity">
        <strong>{{ identity || userLabel }}</strong
        ><span>{{ contentLabel }}</span>
      </p>
      <ElAlert
        v-if="actualOperation === 'RENEW'"
        title="当前权益有效，本次实际执行续期"
        type="info"
        :closable="false"
      />
      <div class="change-row">
        <span>权益状态</span>
        <div>
          {{ before ? statusLabels[before.status] || before.status : '未开通' }} <b>→</b>
          <strong>{{ statusLabels[after.status] || after.status }}</strong>
        </div>
      </div>
      <div class="change-row">
        <span>生效时间</span>
        <div>
          {{ before ? formatDateTime(before.grantedAt) : '—' }} <b>→</b>
          <strong>{{ formatDateTime(after.grantedAt) }}</strong>
        </div>
      </div>
      <div class="change-row">
        <span>到期时间</span>
        <div>
          {{
            before
              ? formatDateTime(
                  before.expiresAt,
                  before.term === 'permanent'
                    ? '永久'
                    : before.status === 'PENDING'
                      ? '尚未开始'
                      : '无到期日期'
                )
              : '—'
          }}
          <b>→</b>
          <strong>{{
            formatDateTime(
              after.expiresAt,
              after.term === 'permanent'
                ? '永久'
                : after.status === 'PENDING'
                  ? '尚未开始'
                  : '无到期日期'
            )
          }}</strong>
        </div>
      </div>
      <div v-if="after.startDeadline" class="change-row">
        <span>启动截止</span>
        <div>
          {{ formatDateTime(before?.startDeadline) }} <b>→</b>
          <strong>{{ formatDateTime(after.startDeadline) }}</strong>
        </div>
      </div>
      <ElCollapse
        ><ElCollapseItem title="对象与版本详情"
          ><small>{{ objectId }} · 预览基于版本 {{ expectedVersion }}</small></ElCollapseItem
        ></ElCollapse
      >
      <ElForm label-position="top">
        <ElFormItem v-if="reasonRequired" label="操作原因（必填）"
          ><ElSelect v-model="reasonType" :disabled="submitting"
            ><ElOption label="运营调整" value="运营调整" /><ElOption
              label="用户申请"
              value="用户申请" /><ElOption label="其他" value="其他" /></ElSelect
        ></ElFormItem>
        <ElFormItem
          :label="
            reasonRequired
              ? reasonType === '其他'
                ? '其他原因说明（必填）'
                : '补充说明（选填）'
              : '备注（选填）'
          "
          ><ElInput
            v-model="note"
            aria-label="操作备注"
            type="textarea"
            maxlength="200"
            show-word-limit
            :disabled="submitting"
            :rows="3"
        /></ElFormItem>
      </ElForm>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    </div>
    <template #footer
      ><ElButton :disabled="submitting" @click="opened = false">返回修改</ElButton
      ><ElButton
        type="primary"
        :loading="submitting"
        :disabled="invalid || submitting"
        @click="confirm"
        >确认{{ actualLabel }}</ElButton
      ></template
    >
  </ElDialog>
</template>
<style scoped lang="scss">
.preview-dialog {
  display: grid;
  gap: 16px;

  .identity {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0;
    font-size: 17px;
  }

  .change-row {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--el-border-color-light);

    > span {
      color: var(--juya-color-text-secondary);
    }

    b {
      margin: 0 8px;
      color: var(--el-color-primary);
    }

    div {
      overflow-wrap: anywhere;
      line-height: 1.6;
    }
  }

  small {
    overflow-wrap: anywhere;
  }
}

@media (width <= 600px) {
  .preview-dialog .change-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

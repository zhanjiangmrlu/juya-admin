<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { FORMAL_TERM_LABELS } from '@/features/entitlements/formal-entitlement-model'
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
  contentKind?: '活动' | '内容包'
  previewedAt?: string
  durationDays?: number
  sceneCount?: number
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
  ACTIVE: '正常使用',
  PAUSED: '已暂停',
  REVOKED: '已撤销',
  EXPIRED: '已到期',
  PENDING: '待开始',
  ENDED: '已结束',
  START_EXPIRED: '启动窗口已过期'
}
const operationLabels: Record<string, string> = {
  GRANT: '开通内容',
  RENEW: '续期',
  EXTEND: '延期',
  REGRANT: '重新开通内容',
  CONVERT_PERMANENT: '转为永久',
  PAUSE: '暂停',
  RESUME: '恢复',
  REVOKE: '撤销',
  REMEDY: '补救',
  EXTEND_START_DEADLINE: '延长启动截止',
  RESTORE_START_WINDOW: '恢复启动窗口'
}
const /** 显示当前权益种类的中文状态
   * @param status - 服务端返回的前态或目标状态代码
   * @returns 当前权益种类对应的业务状态文案
   */ statusLabel = (status: string): string =>
    props.contentKind === '活动' && status === 'ACTIVE' ? '学习中' : statusLabels[status] || status
/** 根据权益种类命名真实确认动作 */
const actualLabel = computed(() =>
  props.contentKind === '活动' && props.actualOperation === 'GRANT'
    ? '开通限时权益'
    : operationLabels[props.actualOperation] || props.actualOperation
)
const invalid = computed(() =>
  props.actualOperation === 'EXTEND'
    ? !note.value.trim()
    : props.reasonRequired && reasonType.value === '其他' && !note.value.trim()
)
const /** 核对原因后发出当前预览的确认 */ confirm = (): void => {
    if (invalid.value || props.submitting) return
    emit(
      'confirm',
      props.reasonRequired
        ? props.actualOperation === 'EXTEND'
          ? note.value.trim()
          : `${reasonType.value}${note.value.trim() ? `：${note.value.trim()}` : ''}`
        : note.value.trim()
    )
  }
</script>
<template>
  <ElDialog
    v-model="opened"
    :title="`确认${actualLabel}`"
    width="min(680px, 94vw)"
    align-center
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <div class="preview-dialog">
      <div class="change-row">
        <span>用户</span>
        <div>{{ identity || userLabel }}</div>
      </div>
      <div class="change-row">
        <span>{{ contentKind ?? '内容包' }}</span>
        <div>
          <strong>{{ contentLabel }}</strong>
        </div>
      </div>
      <div class="change-row">
        <span>实际操作</span>
        <div>
          {{ actualLabel
          }}<span v-if="after.term && Object.hasOwn(FORMAL_TERM_LABELS, after.term)">
            · {{ FORMAL_TERM_LABELS[after.term as keyof typeof FORMAL_TERM_LABELS] }}</span
          >
        </div>
      </div>
      <div v-if="contentKind === '活动' && durationDays !== undefined" class="change-row">
        <span>期限与范围</span>
        <div>
          {{ durationDays }} 天，从首次进入学习计时<span v-if="sceneCount !== undefined">
            · {{ sceneCount }} 个固定场景</span
          >
        </div>
      </div>
      <ElAlert
        v-if="actualOperation === 'RENEW'"
        title="当前权益有效，本次实际执行续期"
        type="info"
        :closable="false"
      />
      <div class="change-row">
        <span>权益状态</span>
        <div>
          {{ before ? statusLabel(before.status) : '未开通' }} <b>→</b>
          <strong>{{ statusLabel(after.status) }}</strong>
        </div>
      </div>
      <div class="change-row">
        <span>{{ contentKind === '活动' ? '授予时间' : '生效时间' }}</span>
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
                    ? '无到期日期'
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
                ? '无到期日期'
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
      <p class="impact">
        <template v-if="contentKind === '活动'">
          {{
            ['PAUSE', 'REVOKE'].includes(actualOperation)
              ? '暂停或撤销后不能继续访问该活动的学习内容；学习进度、收藏和历史记录保留。'
              : actualOperation === 'GRANT'
                ? '开通活动配置中的固定场景；首次进入学习才开始计时。确认时按服务端时间重新计算启动截止。'
                : '按预览调整该活动权益；学习进度、收藏和历史记录保留。'
          }}
        </template>
        <template v-else>
          {{
            ['PAUSE', 'REVOKE'].includes(actualOperation)
              ? '暂不能访问内容包完整内容；收藏、学习进度和历史成果继续保留。操作原因与前后状态记录在操作审计中。'
              : actualOperation === 'EXTEND'
                ? '延期从原到期时间按自然月顺延，暂停状态保持不变；延期原因与前后状态单独记录在操作审计中。'
                : actualOperation === 'RENEW'
                  ? '续期从原到期时间按自然月顺延；确认时状态发生变化，将重新获取预览。'
                  : '确认后可访问该内容包，学习数据按原规则保留。'
          }}
        </template>
      </p>
      <p v-if="previewedAt" class="impact">
        预览时刻：{{
          formatDateTime(previewedAt)
        }}；以上授予时间和启动截止为预览预计，最终以确认回执为准。
      </p>
      <ElCollapse
        ><ElCollapseItem title="对象与版本详情"
          ><small>{{ objectId }} · 预览基于版本 {{ expectedVersion }}</small></ElCollapseItem
        ></ElCollapse
      >
      <ElForm label-position="top">
        <ElFormItem v-if="reasonRequired && actualOperation !== 'EXTEND'" label="操作原因（必填）"
          ><ElSelect v-model="reasonType" :disabled="submitting"
            ><ElOption label="运营调整" value="运营调整" /><ElOption
              label="用户申请"
              value="用户申请" /><ElOption label="其他" value="其他" /></ElSelect
        ></ElFormItem>
        <ElFormItem
          :label="
            actualOperation === 'EXTEND'
              ? '延期原因（必填）'
              : reasonRequired
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
        :type="['PAUSE', 'REVOKE'].includes(actualOperation) ? 'danger' : 'primary'"
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
  gap: 10px;

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
    padding: 2px 0;
    border-bottom: 0;

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

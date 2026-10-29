<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { api } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

import { useAccessOperation } from './use-access-operation'

const props = defineProps<{
  userId: string
  userCode: string
  authorization: components['schemas']['AuthorizationView']
}>()
const emit = defineEmits<{ changed: []; historyRequested: [] }>()
const preview = ref<components['schemas']['GrantPreview'] | null>(null),
  action = ref<components['schemas']['AuthorizationPreview']['action']>('grant'),
  confirmedAction = ref<components['schemas']['AuthorizationPreview']['action']>('grant'),
  expiresOn = ref(''),
  error = ref(''),
  busy = ref(false)
const path = `/api/admin/v1/users/${encodeURIComponent(props.userId)}/learning-authorization`
const operation = useAccessOperation<components['schemas']['AuthorizationView']>(
  path,
  (value) =>
    ['none', 'active', 'expired'].includes(value.status) && typeof value.revision === 'number'
)
const labels = { none: '未授权', active: '授权有效', expired: '已到期' }
const active = computed(() => props.authorization.status === 'active')
const actionLabels = {
  grant: '开通一个月',
  renew: '续期一个月',
  set_expiry: '指定到期日',
  revoke: '撤销授权'
}
/** 选取适用于当前状态的操作，并清除旧核对
 * @param value 管理员主动选择的授权动作
 */
const choose = (value: typeof action.value) => {
  if (busy.value || operation.unknown.value || operation.busy.value) return
  action.value = value
  preview.value = null
  error.value = ''
}
/** 核对稳定用户、当前状态与最终日期，不修改授权 */
const inspect = async () => {
  if (busy.value || operation.unknown.value) return
  busy.value = true
  error.value = ''
  const requestedAction = action.value,
    requestedDate = expiresOn.value
  try {
    const value = await api.request<components['schemas']['GrantPreview']>(`${path}/preview`, {
      method: 'POST',
      body: {
        action: requestedAction,
        expires_on: requestedAction === 'set_expiry' ? requestedDate : null
      }
    })
    if (action.value !== requestedAction || expiresOn.value !== requestedDate) return
    confirmedAction.value = requestedAction
    preview.value = value
    operation.prepare(value.preview_token)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '核对失败，请重试'
  } finally {
    busy.value = false
  }
}
/** 确认保存，未知响应复用原操作查询，不重复加月 */
const save = async () => {
  if (await operation.submit()) {
    preview.value = null
    emit('changed')
  }
}
/** 关闭已核对但未提交的操作 */
const cancel = () => {
  if (!operation.unknown.value && !operation.busy.value) preview.value = null
}
/** 浏览器关闭时提醒仍有待确认操作
 * @param event 原生离开事件
 */
const guard = (event: BeforeUnloadEvent) => {
  if (operation.unknown.value || operation.busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
watch(expiresOn, () => {
  if (!operation.unknown.value) preview.value = null
})
/** 核对当前状态允许的一个月授权操作 */
const openDefault = () => {
  choose(active.value ? 'renew' : 'grant')
  void inspect()
}
/** 核对撤销结果 */
const openRevoke = () => {
  choose('revoke')
  void inspect()
}
/** 版本冲突后刷新真实授权，再允许重新核对 */
const refreshGrant = () => {
  preview.value = null
  emit('changed')
}
onBeforeRouteLeave(() => !operation.unknown.value && !operation.busy.value)
onMounted(() => window.addEventListener('beforeunload', guard))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guard))
</script>
<template>
  <section class="panel authorization-panel">
    <div class="between">
      <div>
        <h2>学习授权</h2>
        <p>统一开放有效已发布场景、主题听读及正文点词。</p>
      </div>
      <span class="badge">{{ labels[authorization.status] }}</span>
    </div>
    <div class="authorization-content">
      <dl>
        <div>
          <dt>开始日期</dt>
          <dd>{{ authorization.starts_on || '尚未开通' }}</dd>
        </div>
        <div>
          <dt>到期日期（当日有效）</dt>
          <dd>{{ authorization.expires_on || '尚未开通' }}</dd>
        </div>
      </dl>
      <div class="authorization-actions">
        <button
          type="button"
          class="primary"
          :disabled="busy || operation.unknown.value || operation.busy.value"
          @click="openDefault"
        >
          {{ active ? '续期一个月' : '开通一个月' }}
        </button>
        <button
          type="button"
          :disabled="busy || operation.unknown.value || operation.busy.value"
          @click="choose('set_expiry')"
        >
          指定到期日
        </button>
        <button
          v-if="active"
          type="button"
          class="danger"
          :disabled="busy || operation.unknown.value || operation.busy.value"
          @click="openRevoke"
        >
          撤销授权
        </button>
        <button type="button" class="text small" @click="emit('historyRequested')">
          查看操作记录
        </button>
      </div>
    </div>
    <div v-if="action === 'set_expiry'" class="expiry-input">
      <label
        >到期日期<input
          v-model="expiresOn"
          type="date"
          aria-label="授权到期日期"
          :disabled="busy || operation.unknown.value || operation.busy.value" /></label
      ><button :disabled="busy || operation.unknown.value" @click="inspect">核对日期</button>
    </div>

    <p v-if="error || operation.error.value" class="notice error" role="alert">
      {{ error || operation.error.value }}
    </p>
    <ElDialog
      v-if="preview"
      :model-value="true"
      :title="actionLabels[confirmedAction]"
      width="520px"
      modal-class="learning-access-mask"
      align-center
      :close-on-click-modal="false"
      :show-close="!operation.unknown.value && !operation.busy.value"
      :close-on-press-escape="!operation.unknown.value && !operation.busy.value"
      :before-close="cancel"
    >
      <p>用户编号：{{ userCode }}</p>
      <p>当前到期日：{{ preview.before.expires_on || '尚未授权' }}</p>
      <p>
        {{
          confirmedAction === 'revoke'
            ? '撤销后立即恢复免费范围权限，历史记录保留。'
            : `最终到期日：${preview.after.expires_on}（当日有效）`
        }}
      </p>
      <p v-if="operation.error.value" class="notice error" role="alert">
        {{ operation.error.value }}
      </p>
      <template #footer
        ><button
          :disabled="busy || operation.unknown.value || operation.busy.value"
          @click="cancel"
        >
          取消</button
        ><button v-if="operation.stale.value" class="primary" @click="refreshGrant">
          刷新后重新核对</button
        ><button v-else class="primary" :disabled="operation.busy.value" @click="save">
          {{
            operation.busy.value
              ? '正在保存…'
              : operation.unknown.value
                ? '查询／重试保存'
                : '确认保存'
          }}
        </button></template
      >
    </ElDialog>
  </section>
</template>
<style scoped lang="scss">
.authorization-panel {
  padding: 24px;
  margin-bottom: 20px;

  h2 {
    font-size: 18px;
  }
}

.authorization-content {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20px;
  align-items: center;

  dl {
    display: flex;
    gap: 32px;
  }

  dt {
    font-size: 12px;
    color: var(--muted);
  }

  dd {
    margin: 6px 0 0;
  }
}

.authorization-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.expiry-input {
  display: flex;
  gap: 12px;
  align-items: end;

  label {
    display: grid;
    gap: 8px;
  }
}
</style>

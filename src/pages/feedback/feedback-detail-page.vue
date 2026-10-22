<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import FeedbackReplyForm from '@/features/feedback/feedback-reply-form.vue'
import FeedbackTimeline from '@/features/feedback/feedback-timeline.vue'
import {
  createFeedbackReply,
  feedbackOutcomeUnknown,
  readFeedbackDraft,
  saveFeedbackDraft
} from '@/services/feedback-service'
import { api, ApiError } from '@/services/http-client'
import { registerLogoutGuard } from '@/services/logout-guard'
import { useAdminStore } from '@/stores/admin-store'

import type {
  FeedbackDetail,
  FeedbackReadReceipt,
  FeedbackStatus,
  FeedbackUnread
} from '@/shared/types/feedback'

const route = useRoute(),
  admin = useAdminStore()
const detail = ref<FeedbackDetail | null>(null),
  loading = ref(false),
  error = ref(''),
  readError = ref(''),
  actionError = ref(''),
  notice = ref(''),
  text = ref(''),
  status = ref<FeedbackStatus | ''>(''),
  busy = ref(false),
  pending = ref(false),
  retryAllowed = ref(false),
  frozenBody = ref(false),
  conflict = ref(false),
  leaveOpen = ref(false)
const back = computed(() => {
  const value = String(route.query.back || '')
  return value === '/feedback' || value.startsWith('/feedback?') ? value : '/feedback'
})
let alive = true,
  generation = 0,
  readGeneration = 0,
  editingOwner = '',
  editingId = '',
  operation: ReturnType<typeof createFeedbackReply> | null = null,
  pendingLeave: ((value: boolean) => void) | null = null,
  readSnapshot: {
    id: string
    event: number
    key: string
    owner: string
    phase: 'write' | 'unknown' | 'confirmed'
  } | null = null
/** 同步原操作元数据，正文只留在当前页面内存 */
const syncPending = () => {
  pending.value = operation?.pending() || false
  retryAllowed.value = operation?.canRetry() || false
  frozenBody.value = operation?.hasBody() || false
}
/** 只确认已经渲染的事件水位，再重查未读聚合，旧回执不清后来的红点 */
const acknowledge = async () => {
  const snapshot = readSnapshot
  if (!snapshot || snapshot.owner !== admin.identity?.id || !alive) return
  const run = ++readGeneration
  readError.value = ''
  try {
    if (snapshot.phase === 'unknown') {
      try {
        await api.request<{ status: 'succeeded'; result: FeedbackReadReceipt }>(
          `/api/admin/v1/operations/${encodeURIComponent(snapshot.key)}`
        )
        snapshot.phase = 'confirmed'
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.code !== 'operation_unknown') throw reason
        snapshot.phase = 'write'
      }
    }
    if (!alive || run !== readGeneration || snapshot.owner !== admin.identity?.id) return
    if (snapshot.phase === 'write') {
      try {
        await api.request<FeedbackReadReceipt>(
          `/api/admin/v1/feedback/${encodeURIComponent(snapshot.id)}/read`,
          { method: 'PUT', body: { event_id: snapshot.event }, key: snapshot.key }
        )
        snapshot.phase = 'confirmed'
      } catch (reason) {
        if (feedbackOutcomeUnknown(reason)) snapshot.phase = 'unknown'
        throw reason
      }
    }
    if (!alive || run !== readGeneration || snapshot.owner !== admin.identity?.id) return
    const unread = await api.request<FeedbackUnread>('/api/admin/v1/feedback/unread')
    if (alive && run === readGeneration && snapshot.owner === admin.identity?.id)
      window.dispatchEvent(new CustomEvent('admin-feedback-unread-changed', { detail: unread }))
  } catch (reason) {
    if (alive && run === readGeneration)
      readError.value = reason instanceof Error ? reason.message : '已读状态暂未同步'
  }
}
/** 接收完整详情后等待时间线渲染，只标记实际存在的最高事件
 * @param value 当前请求成功读取或提交的详情快照
 */
const accept = async (value: FeedbackDetail) => {
  detail.value = value
  const run = generation,
    owner = admin.identity?.id
  await nextTick()
  if (!alive || run !== generation || owner !== admin.identity?.id || !owner) return
  const latest = Math.min(
    value.latest_event_id,
    Math.max(0, ...value.events.map((event) => event.id))
  )
  if (value.unread && latest > 0) {
    readSnapshot = { id: value.id, event: latest, key: crypto.randomUUID(), owner, phase: 'write' }
    void acknowledge()
  }
}
/** 刷新真实时间线，读取失败保留最后可信记录及回复输入 */
const load = async () => {
  if (loading.value) return
  loading.value = true
  error.value = ''
  const run = ++generation,
    owner = admin.identity?.id,
    id = String(route.params.id || '')
  try {
    const value = await api.request<FeedbackDetail>(
      `/api/admin/v1/feedback/${encodeURIComponent(id)}`
    )
    if (!alive || run !== generation || owner !== admin.identity?.id) return
    await accept(value)
    if (conflict.value) notice.value = '已获取最新记录，请核对后再次确认回复和处理动作'
    conflict.value = false
  } catch (reason) {
    if (alive && run === generation)
      error.value = reason instanceof Error ? reason.message : '反馈暂未获取，请重试'
  } finally {
    if (alive && run === generation) loading.value = false
  }
}
/** 保存失效身份的输入，后续只能由同一身份确认后恢复 */
const preserveDraft = () => {
  if (editingOwner && editingId)
    saveFeedbackDraft(editingOwner, editingId, { text: text.value, status: status.value })
}
/** 准备当前账号和反馈的独立操作上下文，不自动重提历史回复 */
const initialize = () => {
  generation++
  readGeneration++
  loading.value = false
  busy.value = false
  editingOwner = admin.identity?.id || ''
  editingId = String(route.params.id || '')
  const draft = editingOwner ? readFeedbackDraft(editingOwner, editingId) : null
  detail.value = null
  readSnapshot = null
  text.value = draft?.text || ''
  status.value = draft?.status || ''
  actionError.value = ''
  notice.value = ''
  readError.value = ''
  conflict.value = false
  operation = createFeedbackReply(String(route.params.id || ''), {
    owner: () => admin.identity?.id || null,
    request: api.request,
    storage: sessionStorage
  })
  syncPending()
  if (pending.value) notice.value = '有一条回复结果尚未确认，请先查询原操作；不会自动重新提交'
  void load()
}
/** 只有确认成功后清空回复，接受服务器状态并追加同一时间线
 * @param value 本次操作实际持久化的详情
 */
const replied = async (value: FeedbackDetail) => {
  text.value = ''
  status.value = ''
  saveFeedbackDraft(editingOwner, editingId, null)
  notice.value = '回复与处理结果已保存'
  actionError.value = ''
  await accept(value)
}
/** 提交明确回复或状态动作，失败不先改变当前处理状态 */
const send = async () => {
  if (
    !detail.value ||
    !operation ||
    busy.value ||
    conflict.value ||
    (pending.value && !retryAllowed.value)
  )
    return
  const content = text.value.trim(),
    length = Array.from(content).length
  if (length > 500 || (!length && status.value !== 'processing')) return
  busy.value = true
  actionError.value = ''
  const run = generation
  try {
    const value = await operation.send({
      ...(content ? { text: content } : {}),
      ...(status.value && status.value !== 'pending'
        ? { status: status.value, expected_latest_event_id: detail.value.latest_event_id }
        : {})
    })
    if (alive && run === generation) await replied(value)
  } catch (reason) {
    if (!alive || run !== generation) return
    actionError.value = reason instanceof Error ? reason.message : '回复未成功，请重试'
    if (reason instanceof ApiError && reason.code === 'feedback_changed') conflict.value = true
  } finally {
    if (alive && run === generation) {
      syncPending()
      busy.value = false
    }
  }
}
/** 主动查询原操作，未查到时仅允许用户明确复用原键重试 */
const recover = async () => {
  if (!operation || busy.value) return
  busy.value = true
  actionError.value = ''
  const run = generation,
    current = operation
  try {
    const value = await current.recover()
    if (!alive || run !== generation) return
    if (value) {
      await replied(value)
      conflict.value = true
      await load()
    } else
      notice.value = operation.hasBody()
        ? '尚未查到原回复，可用原操作键重试相同内容'
        : '尚未查到原回复，请填写原内容并用原操作键重试'
  } catch (reason) {
    if (alive && run === generation)
      actionError.value = reason instanceof Error ? reason.message : '结果暂未确认，请稍后重新查询'
  } finally {
    if (alive && operation === current) {
      syncPending()
      busy.value = false
    }
  }
}
/** 离开或注销前保护未提交输入和待确认结果
 * @returns 是否允许结束当前编辑
 */
const confirmLeaving = (): Promise<boolean> => {
  if (!text.value.trim() && !pending.value && !busy.value) return Promise.resolve(true)
  leaveOpen.value = true
  return new Promise((resolve) => {
    pendingLeave = resolve
  })
}
/** 返回明确的离开选择，不把页面关闭当作处理完成
 * @param allow 是否放弃本地输入并离开
 */
const leave = (allow: boolean) => {
  leaveOpen.value = false
  if (allow) {
    saveFeedbackDraft(editingOwner, editingId, null)
    text.value = ''
    status.value = ''
  }
  pendingLeave?.(allow)
  pendingLeave = null
}
/** 浏览器关闭时提醒本地尚未提交的内容
 * @param event 浏览器原生离开事件
 */
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (text.value.trim() || pending.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
const releaseLogout = registerLogoutGuard(confirmLeaving)
onBeforeRouteLeave((to) => (to.path === '/login' ? true : confirmLeaving()))
onBeforeRouteUpdate((to, from) => (to.params.id === from.params.id ? true : confirmLeaving()))
watch(() => route.params.id, initialize)
onMounted(() => {
  initialize()
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('admin-session-expired', preserveDraft)
})
onBeforeUnmount(() => {
  if (editingOwner !== admin.identity?.id) preserveDraft()
  alive = false
  generation++
  readGeneration++
  releaseLogout()
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('admin-session-expired', preserveDraft)
  pendingLeave?.(false)
})
</script>
<template>
  <div class="feedback-detail-page">
    <div class="page-heading between">
      <div>
        <h1>处理反馈</h1>
        <p>回复与状态会同步到用户的原反馈记录。</p>
      </div>
      <RouterLink :to="back" class="button-link" data-action="feedback-back"
        >返回反馈列表</RouterLink
      >
    </div>
    <AppState :busy="loading" :error="error" @retry="load" />
    <p v-if="readError" class="notice error" role="alert">
      {{ readError
      }}<button type="button" class="text" data-action="retry-read" @click="acknowledge">
        重试已读同步
      </button>
    </p>
    <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="conflict" class="notice">
      <button :disabled="loading" @click="load">重新获取最新记录</button>
    </p>
    <div v-if="pending" class="notice between">
      <span>上次回复结果待确认</span>
      <div class="row">
        <button data-action="resolve-feedback" :disabled="busy" @click="recover">
          查询原操作结果</button
        ><button v-if="retryAllowed && frozenBody" :disabled="busy" @click="send">
          用原操作键重试回复
        </button>
      </div>
    </div>
    <div v-if="detail" class="feedback-layout">
      <FeedbackTimeline :key="detail.id" :detail="detail" /><FeedbackReplyForm
        v-model:text="text"
        v-model:status="status"
        :current="detail.status"
        :busy="busy"
        :blocked="conflict || Boolean(pending && (!retryAllowed || frozenBody))"
        @send="send"
      />
    </div>
    <ElDialog
      v-model="leaveOpen"
      title="离开反馈处理？"
      width="460px"
      :close-on-click-modal="false"
      @close="leave(false)"
      ><p>尚未提交的输入会丢失。待确认操作可重新查询，离开不会把反馈标记为已处理。</p>
      <template #footer
        ><button @click="leave(false)">继续编辑</button
        ><button @click="leave(true)">放弃本地输入并离开</button></template
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.feedback-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
  gap: 40px;

  :deep(.panel) {
    padding: 28px;
  }
}

@media (width <= 1050px) {
  .feedback-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>

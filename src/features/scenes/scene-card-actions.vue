<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { CardView } from '@/features/scenes/editor-model'
import type { components } from '@/shared/contracts/generated/admin-api'

import SceneTitle from './scene-title.vue'
type Batch = components['schemas']['ActionBatchView']
type Selection = components['schemas']['ActionSelection']
const props = defineProps<{ action: 'offline' | 'delete'; cardIds: string[]; batchId?: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const cards = ref<CardView[]>([]),
  skipped = ref<Selection[]>([]),
  result = ref<Batch | null>(null)
const busy = ref(false),
  loading = ref(true),
  unknown = ref(false),
  error = ref('')
const action = ref(props.action)
const reviewIds = ref([...props.cardIds])
const verb = computed(() => (action.value === 'delete' ? '删除' : '下线'))
const eligible = computed(() =>
  cards.value.filter((card) => action.value === 'delete' || card.status === 'published')
)
const excluded = computed(() => cards.value.filter((card) => !eligible.value.includes(card)))
let alive = true,
  timer: ReturnType<typeof setTimeout> | null = null,
  checks = 0,
  generation = 0
type Pending =
  | { key: string; body: components['schemas']['CreateActionBatch'] }
  | { key: string; batchId: string; action: 'offline' | 'delete' }
let pending: Pending | null = null
const storageKey = 'juya-pending-card-actions'
/** 用冻结正文及原键提交或确认同一次操作
 * @returns 服务端接受的原始批次
 */
const submitPending = () => {
  if (!pending) throw new Error('缺少原操作凭证，请重新核对')
  return api.request<Batch>(
    'batchId' in pending
      ? `/api/admin/v1/card-action-batches/${pending.batchId}/retry`
      : '/api/admin/v1/card-action-batches',
    { method: 'POST', key: pending.key, body: 'body' in pending ? pending.body : undefined }
  )
}
/** 判断写响应是否需要先查询原凭证
 * @param reason 传输或服务器错误
 * @returns 是否无法确认接收结果
 */
const isUnknown = (reason: unknown) =>
  !(reason instanceof ApiError) ||
  !reason.status ||
  reason.status >= 500 ||
  reason.code === 'response_unknown'
/** 将已核对卡片冻结为状态与版本快照
 * @param card 当前读取的卡片
 * @returns 服务器执行前需要复核的引用
 */
const snapshot = (card: CardView): Selection => ({
  card_id: card.id,
  revision: card.draft_revision,
  status: card.status as Selection['status'],
  version_id: card.current_version_id
})
/** 显示可读的失败或跳过原因
 * @param item 持久化逐卡结果
 * @returns 管理员可读的原因
 */
const reason = (item: Batch['items'][number]) =>
  item.needs_review
    ? '资料或状态已变化，须重新核对确认'
    : item.state === 'skipped'
      ? '当前状态不适用，已跳过'
      : item.state === 'failed'
        ? item.error_code === 'worker_interrupted'
          ? '处理进程中断，可重试失败项'
          : `本项处理失败（${item.error_code || '原因暂未获取'}），可重试失败项`
        : item.state === 'succeeded'
          ? '已完成'
          : '正在处理'
/** 有限读取真实结果，离页后可从最近操作恢复 */
const poll = async () => {
  if (!result.value || !alive) return
  if (timer) clearTimeout(timer)
  const run = ++generation,
    id = result.value.id
  try {
    const value = await api.request<Batch>(`/api/admin/v1/card-action-batches/${id}`)
    if (!alive || run !== generation || result.value?.id !== id) return
    result.value = value
    emit('changed')
    if (
      value.items.some((item) => ['queued', 'running', 'retry'].includes(item.state)) &&
      checks++ < 20
    )
      timer = setTimeout(() => {
        void poll()
      }, 1500)
  } catch (reason) {
    if (alive && run === generation)
      error.value = reason instanceof Error ? reason.message : '结果暂未获取'
  }
}
/** 接收批次后清理本地未确认凭证并查询逐卡终态
 * @param value 已接受批次或恢复到的同次结果
 */
const accept = (value: Batch) => {
  generation++
  if (timer) clearTimeout(timer)
  action.value = value.action
  result.value = value
  unknown.value = false
  pending = null
  sessionStorage.removeItem(storageKey)
  emit('changed')
  if (value.items.some((item) => ['queued', 'running', 'retry'].includes(item.state))) void poll()
}
/** 逐卡读取当前资料，不因部分卡片已删除而放弃其余核对
 * @param ids 本次原始选择或原失败集合
 */
const review = async (ids: string[]) => {
  reviewIds.value = [...ids]
  loading.value = true
  error.value = ''
  cards.value = []
  skipped.value = []
  try {
    for (const id of ids) {
      try {
        const card = await api.request<CardView>(`/api/admin/v1/cards/${encodeURIComponent(id)}`)
        if (alive) cards.value.push(card)
      } catch (reason) {
        if (reason instanceof ApiError && [404, 410].includes(reason.status))
          skipped.value.push({ card_id: id, revision: 1, status: 'deleted', version_id: null })
        else throw reason
      }
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '核对资料失败，请重试'
  } finally {
    loading.value = false
  }
}
/** 冻结适用集合，接收未知时禁止创建第二次批次 */
const confirm = async () => {
  if (busy.value || loading.value || unknown.value || !eligible.value.length) return
  busy.value = true
  error.value = ''
  pending ||= {
    key: crypto.randomUUID(),
    body: {
      action: action.value,
      confirmed: true,
      items: eligible.value.map(snapshot),
      skipped: [...excluded.value.map(snapshot), ...skipped.value]
    }
  }
  sessionStorage.setItem(storageKey, JSON.stringify(pending))
  try {
    accept(await submitPending())
  } catch (reason) {
    unknown.value = isUnknown(reason)
    error.value = unknown.value
      ? '结果待确认，请先查询原操作结果'
      : reason instanceof Error
        ? reason.message
        : '提交失败'
    if (!unknown.value) {
      pending = null
      sessionStorage.removeItem(storageKey)
    }
  } finally {
    busy.value = false
  }
}
/** 先查询原键；明确尚无回执时才允许原正文重试 */
const recover = async () => {
  if (!pending || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const receipt = await api.request<components['schemas']['OperationResponse']>(
      `/api/admin/v1/operations/${pending.key}`
    )
    accept(receipt.result as unknown as Batch)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '结果尚未确认'
    if (reason instanceof ApiError && reason.status === 404) {
      try {
        accept(await submitPending())
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : '结果待确认'
      }
    }
  } finally {
    busy.value = false
  }
}
/** 原批次只重试服务器仍允许重试的失败项 */
const retry = async () => {
  if (!result.value || busy.value || unknown.value) return
  generation++
  if (timer) clearTimeout(timer)
  busy.value = true
  pending = { key: crypto.randomUUID(), batchId: result.value.id, action: action.value }
  sessionStorage.setItem(storageKey, JSON.stringify(pending))
  error.value = ''
  try {
    checks = 0
    accept(await submitPending())
  } catch (reason) {
    unknown.value = isUnknown(reason)
    error.value = unknown.value
      ? '重试结果待确认，请先查询原操作结果'
      : reason instanceof Error
        ? reason.message
        : '重试失败'
    if (!unknown.value) {
      pending = null
      sessionStorage.removeItem(storageKey)
    }
  } finally {
    busy.value = false
  }
}
/** 仅将原失败集合重新读取并交给管理员重新确认 */
const recheck = async () => {
  const ids =
    result.value?.items.filter((item) => item.state === 'failed').map((item) => item.card_id) || []
  generation++
  if (timer) clearTimeout(timer)
  result.value = null
  pending = null
  await review(ids)
}
onMounted(async () => {
  try {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      pending = JSON.parse(saved)
      if (pending) action.value = 'body' in pending ? pending.body.action : pending.action
      unknown.value = true
      loading.value = false
      return
    }
  } catch {
    sessionStorage.removeItem(storageKey)
  }
  if (props.batchId) {
    try {
      result.value = await api.request<Batch>(`/api/admin/v1/card-action-batches/${props.batchId}`)
      action.value = result.value.action
      void poll()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '结果暂未获取'
    }
    loading.value = false
    return
  }
  await review([...props.cardIds])
})
onBeforeUnmount(() => {
  alive = false
  if (timer) clearTimeout(timer)
})
</script>
<template>
  <ElDialog
    :model-value="true"
    :title="`批量${verb}`"
    width="860px"
    align-center
    :close-on-click-modal="false"
    :show-close="!busy"
    @close="emit('close')"
  >
    <p>
      {{
        action === 'delete'
          ? '移出后台主列表，停止用户学习，不提供恢复入口。'
          : '停止用户学习，可重新发布。'
      }}学习记录及打卡保留。
    </p>
    <p v-if="loading" role="status">正在读取最新卡片状态…</p>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <template v-if="result">
      <p role="status">
        成功 {{ result.items.filter((i) => i.state === 'succeeded').length }} 张 · 失败
        {{ result.items.filter((i) => i.state === 'failed').length }} 张 · 跳过
        {{ result.items.filter((i) => i.state === 'skipped').length }} 张 · 处理中
        {{ result.items.filter((i) => ['queued', 'running', 'retry'].includes(i.state)).length }} 张
      </p>
      <ul>
        <li v-for="item in result.items" :key="item.id">
          <SceneTitle :name="item.name" :title-en="item.title_en" /> · {{ reason(item) }}
        </li>
      </ul>
      <button
        v-if="result.items.some((i) => i.state === 'failed' && !i.needs_review)"
        :disabled="busy || unknown"
        @click="retry"
      >
        重试失败项
      </button>
      <button
        v-if="result.items.some((i) => i.needs_review)"
        :disabled="busy || unknown"
        @click="recheck"
      >
        重新核对失败项
      </button>
      <button :disabled="busy || unknown" @click="poll">刷新处理结果</button>
    </template>
    <template v-else-if="!unknown && !loading">
      <p>
        已选择 {{ cards.length + skipped.length }} 张 · 可{{ verb }} {{ eligible.length }} 张 · 跳过
        {{ excluded.length + skipped.length }} 张
      </p>
      <ul>
        <li v-for="card in cards" :key="card.id">
          <SceneTitle :name="card.display_name" :title-en="card.display_title_en" /> ·
          {{ card.status === 'published' ? '已发布' : card.status === 'draft' ? '草稿' : '已下线'
          }}{{ eligible.includes(card) ? '' : ' · 当前状态不适用，跳过' }}
        </li>
      </ul>
      <p v-if="skipped.length">{{ skipped.length }} 张卡片已不可用，跳过</p>
      <button v-if="error" @click="review(reviewIds)">重新读取核对资料</button>
    </template>
    <template #footer>
      <button data-action="close-card-actions" :disabled="busy" @click="emit('close')">
        {{ result ? '关闭结果' : '取消' }}
      </button>
      <button v-if="unknown" data-action="recover-card-actions" :disabled="busy" @click="recover">
        查询原操作结果
      </button>
      <button
        v-else-if="!result"
        data-action="confirm-card-actions"
        class="primary"
        :disabled="busy || loading || !!error || !eligible.length"
        @click="confirm"
      >
        确认{{ verb }}{{ eligible.length }}张
      </button>
    </template>
  </ElDialog>
</template>
<style scoped lang="scss">
ul {
  max-height: 45vh;
  overflow: auto;
  padding-left: 22px;
}

li {
  margin: 12px 0;
  overflow-wrap: anywhere;
}
</style>

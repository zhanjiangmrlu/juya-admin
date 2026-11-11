<script setup lang="ts">
import { ElButton, ElDialog, ElProgress, ElTable, ElTableColumn } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { api, ApiError } from '@/services/http-client'
import { useAdminStore } from '@/stores/admin-store'

import type { components } from '@/shared/contracts/generated/admin-api'

type Preview = components['schemas']['FreeBatchPreview']
type Result = components['schemas']['FreeBatchResult']
type Submission = components['schemas']['FreeBatchSubmit']
const props = defineProps<{ kind: 'scene' | 'listening'; ids: string[] }>()
const emit = defineEmits<{
  changed: []
  completed: [failed: string[]]
  restored: []
  processing: [active: boolean]
}>()
const admin = useAdminStore()
const owner = computed(() => admin.identity?.id || '')
const scope = computed(
  () => `${import.meta.env.VITE_API_BASE_URL || location.origin}:${owner.value}:${props.kind}`
)
const operationStorageKey = computed(() => `juya-free-operation:${scope.value}`)
const storageKey = computed(() => `juya-free-task:${scope.value}`)
const prefix = '/api/admin/v1/free-access-batches'
const preview = ref<Preview | null>(null),
  result = ref<Result | null>(null),
  open = ref(false),
  busy = ref(false),
  error = ref(''),
  unknown = ref(false),
  restoringTaskId = ref('')
const unit = computed(() => (props.kind === 'scene' ? '张' : '篇'))
const fenced = computed(() => unknown.value || !!restoringTaskId.value || !!result.value?.pending)
let pending: { key: string; body: Submission; path: string } | null = null,
  timer: ReturnType<typeof setTimeout> | null = null,
  alive = true,
  mounted = false,
  generation = 0,
  parentId = '',
  observed = ''
const statusText: Record<string, string> = {
  pending: '处理中',
  succeeded: '成功',
  skipped: '跳过',
  failed: '失败'
}
/** 仅接受仍属于当前管理员及组件代际的响应
 * @param run 发起请求时冻结的身份代际
 * @returns 当前响应是否仍可更新界面和私有跟踪
 */
const current = (run: number) => alive && run === generation && !!owner.value
/** 保存原任务权威回执，完成后只保留明确失败项
 * @param value 原任务完整逐项结果
 * @param run 发起查询或提交时的身份代际
 */
const observe = (value: Result, run: number) => {
  if (!current(run)) return
  result.value = value
  restoringTaskId.value = ''
  emit('processing', value.pending > 0)
  if (!current(run)) return
  sessionStorage.setItem(storageKey.value, value.id)
  if (['succeeded', 'failed'].includes(value.state) && value.pending === 0) {
    const signature = `${value.id}:${value.succeeded}:${value.failed}`
    if (observed !== signature) {
      observed = signature
      emit(
        'completed',
        value.items.filter((item) => item.status === 'failed').map((item) => item.content_id)
      )
      emit('changed')
    }
  } else
    timer = setTimeout(() => {
      void query()
    }, 1000)
}
/** 只读重查原任务；首次恢复失败也保留ID和围栏 */
const query = async () => {
  const id = restoringTaskId.value || result.value?.id,
    run = generation
  if (!current(run) || busy.value || !id) return
  const taskKey = storageKey.value
  busy.value = true
  error.value = ''
  try {
    const value = await api.request<Result>(`${prefix}/${id}`)
    observe(value, run)
  } catch (reason) {
    if (!current(run)) return
    error.value = reason instanceof Error ? reason.message : '结果暂未确认，请查询原任务'
    if (
      reason instanceof ApiError &&
      reason.code === 'free_batch_missing' &&
      reason.status === 404
    ) {
      restoringTaskId.value = ''
      result.value = null
      sessionStorage.removeItem(taskKey)
      emit('processing', false)
    }
  } finally {
    if (current(run)) busy.value = false
  }
}
/** 重读全部选择，展示适用与跳过名单
 * @param enabled 当前明确选择的目标免费状态
 * @param retry 是否仅重新核对原失败子集
 */
const prepare = async (enabled: boolean, retry = false) => {
  const run = generation
  if (!current(run) || busy.value || fenced.value) return
  const ids = retry
    ? result.value?.items
        .filter((item) => item.status === 'failed')
        .map((item) => item.content_id) || []
    : props.ids
  if (!ids.length) return
  busy.value = true
  error.value = ''
  parentId = retry ? result.value!.id : ''
  try {
    const value = await api.request<Preview>(`${prefix}/preview`, {
      method: 'POST',
      body: { content_type: props.kind, ids: [...ids], is_free: enabled }
    })
    if (!current(run)) return
    preview.value = value
    open.value = true
    pending = null
  } catch (reason) {
    if (current(run)) error.value = reason instanceof Error ? reason.message : '预览失败，请重试'
  } finally {
    if (current(run)) busy.value = false
  }
}
/** 未知先查原Operation；只在明确未受理后以原键和冻结正文恢复 */
const submit = async () => {
  const run = generation
  if (!current(run) || busy.value || restoringTaskId.value || (!preview.value && !pending)) return
  if (!pending) {
    if (!preview.value?.applicable) return
    pending = {
      key: crypto.randomUUID(),
      path: parentId ? `${prefix}/${parentId}/retry` : prefix,
      body: {
        preview_token: preview.value.preview_token,
        items: preview.value.items.filter((item) => item.status === 'pending')
      }
    }
  }
  const write = pending,
    operationKey = operationStorageKey.value
  sessionStorage.setItem(operationKey, JSON.stringify(write))
  emit('processing', true)
  busy.value = true
  error.value = ''
  try {
    let value: Result | undefined
    if (unknown.value) {
      try {
        value = (await api.request<{ result: Result }>(`/api/admin/v1/operations/${write.key}`))
          .result
      } catch (reason) {
        if (!current(run)) return
        if (!(reason instanceof ApiError) || reason.code !== 'operation_unknown') throw reason
      }
    }
    if (!current(run)) return
    value ||= await api.request<Result>(write.path, {
      method: 'POST',
      body: write.body,
      key: write.key
    })
    if (!current(run)) return
    pending = null
    sessionStorage.removeItem(operationKey)
    unknown.value = false
    preview.value = null
    observe(value, run)
  } catch (reason) {
    if (!current(run)) return
    error.value = reason instanceof Error ? reason.message : '提交结果未确认，请查询原操作'
    unknown.value =
      reason instanceof ApiError &&
      (['network_unknown', 'response_unknown'].includes(reason.code) || reason.status >= 500)
    if (!unknown.value) {
      emit('processing', false)
      pending = null
      sessionStorage.removeItem(operationKey)
    }
  } finally {
    if (current(run)) busy.value = false
  }
}
/** 取消只清预览，不清列表选择或原结果 */
const cancel = () => {
  if (!busy.value && !unknown.value) {
    open.value = false
    preview.value = null
    pending = null
  }
}
/** 关闭详情保留已受理任务和只读重查入口 */
const close = () => {
  if (!busy.value && !unknown.value) open.value = false
}
/** 只恢复当前管理员已发送操作或已接受任务，不恢复未提交选择 */
const restore = async () => {
  if (!current(generation)) return
  const submitted = sessionStorage.getItem(operationStorageKey.value)
  if (submitted) {
    try {
      pending = JSON.parse(submitted)
      unknown.value = true
      emit('processing', true)
      open.value = true
      emit('restored')
      error.value = '上次提交结果尚未确认，请先查询原操作'
      return
    } catch {
      sessionStorage.removeItem(operationStorageKey.value)
    }
  }
  const id = sessionStorage.getItem(storageKey.value)
  if (!id) return
  restoringTaskId.value = id
  emit('processing', true)
  emit('restored')
  open.value = true
  await query()
}
/** 身份切换废弃旧请求、计时器与内存状态；新身份只读自己的跟踪 */
const invalidate = () => {
  generation++
  if (timer) clearTimeout(timer)
  timer = null
  pending = null
  parentId = ''
  observed = ''
  preview.value = null
  result.value = null
  restoringTaskId.value = ''
  unknown.value = false
  busy.value = false
  error.value = ''
  open.value = false
  emit('processing', false)
  if (mounted && owner.value) void restore()
}
watch(() => [admin.identity?.id, props.kind], invalidate, { flush: 'sync' })
onMounted(() => {
  mounted = true
  void restore()
})
onBeforeUnmount(() => {
  alive = false
  generation++
  if (timer) clearTimeout(timer)
})
</script>
<template>
  <span class="free-batch-controls">
    <ElButton
      class="primary"
      data-action="enable-free"
      :disabled="!owner || !ids.length || busy || fenced"
      @click="prepare(true)"
      >批量开启免费</ElButton
    >
    <ElButton
      data-action="disable-free"
      :disabled="!owner || !ids.length || busy || fenced"
      @click="prepare(false)"
      >批量关闭免费</ElButton
    >
    <ElButton v-if="result || restoringTaskId" link @click="open = true">查看本次结果</ElButton>
    <small v-if="error && !open" role="alert">{{ error }}</small>
    <ElDialog
      :model-value="open"
      :title="preview ? `批量${preview.is_free ? '开启' : '关闭'}免费` : '批量免费设置结果'"
      width="680px"
      class="free-batch-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy && !unknown"
      :show-close="!busy && !unknown"
      @update:model-value="close"
    >
      <template v-if="preview">
        <p>
          本次已选 {{ preview.total }}{{ unit }}，将变更 {{ preview.applicable }}{{ unit }}，跳过
          {{ preview.skipped }}{{ unit }}
        </p>
        <p>仅处理当前有效已发布、未删除且可操作的内容，不自动发布或恢复</p>
        <ElTable :data="preview.items" max-height="320" row-key="content_id">
          <ElTableColumn prop="name" label="完整名称" min-width="240" />
          <ElTableColumn label="处理明细" min-width="250"
            ><template #default="{ row }">{{
              row.status === 'pending' ? '将变更' : `跳过：${row.message}`
            }}</template></ElTableColumn
          >
        </ElTable>
        <p class="impact">
          {{
            preview.is_free
              ? '开启后，游客和未授权用户可学习这些已发布内容；正文任意点词仍需有效授权'
              : '关闭后，无有效授权用户不能继续获取受保护资源；成绩、收藏、打卡及阅读进度保留'
          }}
        </p>
      </template>
      <template v-if="result && !preview">
        <p role="status">
          已处理 {{ result.total - result.pending }}/{{ result.total }}{{ unit }} · 成功
          {{ result.succeeded }} · 跳过 {{ result.skipped }} · 失败 {{ result.failed }}
        </p>
        <ElProgress
          v-if="result.pending"
          :percentage="Math.floor(((result.total - result.pending) / result.total) * 100)"
        />
        <ElTable :data="result.items" max-height="320" row-key="content_id">
          <ElTableColumn prop="name" label="完整名称" min-width="210" />
          <ElTableColumn label="结果" width="80"
            ><template #default="{ row }">{{ statusText[row.status] }}</template></ElTableColumn
          >
          <ElTableColumn label="原因" min-width="220"
            ><template #default="{ row }">{{
              row.message || '已按本次目标处理'
            }}</template></ElTableColumn
          >
        </ElTable>
        <p class="impact">如结果尚未确认，先查询原任务，不直接重复提交全部内容</p>
      </template>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <template #footer>
        <ElButton v-if="unknown" data-action="query-free" :loading="busy" @click="submit"
          >查询本次结果</ElButton
        >
        <template v-else-if="preview">
          <ElButton data-action="cancel-preview" :disabled="busy" @click="cancel">取消</ElButton>
          <ElButton
            class="primary"
            data-action="confirm-free"
            :loading="busy"
            :disabled="!preview.applicable"
            @click="submit"
            >确认{{ preview.is_free ? '开启' : '关闭' }}{{ preview.applicable }}{{ unit }}</ElButton
          >
        </template>
        <template v-else>
          <ElButton :disabled="busy" @click="close">返回列表</ElButton>
          <ElButton
            v-if="restoringTaskId || result?.pending"
            data-action="query-task"
            :loading="busy"
            @click="query"
            >{{ restoringTaskId ? '重新查询原任务' : '查询处理进度' }}</ElButton
          >
          <ElButton
            v-if="result?.failed && !result.pending"
            class="primary"
            :disabled="busy"
            @click="prepare(result.is_free, true)"
            >仅重试{{ result.failed }}{{ unit }}失败项</ElButton
          >
        </template>
      </template>
    </ElDialog>
  </span>
</template>
<style scoped lang="scss">
.free-batch-controls {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.impact {
  margin-top: 16px;
  padding: 14px;
  background: #edf3e7;
  border-radius: 8px;
}
</style>

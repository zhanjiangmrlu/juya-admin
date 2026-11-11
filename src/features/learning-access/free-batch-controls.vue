<script setup lang="ts">
import { ElButton, ElDialog, ElProgress, ElTable, ElTableColumn } from 'element-plus'
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

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
const preview = ref<Preview | null>(null),
  result = ref<Result | null>(null),
  open = ref(false),
  busy = ref(false),
  error = ref(''),
  unknown = ref(false)
const unit = computed(() => (props.kind === 'scene' ? '张' : '篇'))
const hasStore = Object.getOwnPropertySymbols(getCurrentInstance()?.appContext.provides || {}).some(
  (key) => key.description === 'pinia'
)
const owner = hasStore ? useAdminStore().identity?.id || 'none' : 'isolated'
const scope = `${import.meta.env.VITE_API_BASE_URL || location.origin}:${owner}:${props.kind}`
const operationStorageKey = `juya-free-operation:${scope}`
const storageKey = `juya-free-task:${scope}`,
  prefix = '/api/admin/v1/free-access-batches'
let pending: { key: string; body: Submission; path: string } | null = null,
  timer: ReturnType<typeof setTimeout> | null = null,
  alive = true,
  parentId = ''
let observed = ''
const statusText: Record<string, string> = {
  pending: '处理中',
  succeeded: '成功',
  skipped: '跳过',
  failed: '失败'
}
/** 保存当前任务真实结果，完成后只保留明确失败项
 * @param value 原任务的权威逐项回执
 */
const observe = async (value: Result) => {
  result.value = value
  emit('processing', value.pending > 0)
  sessionStorage.setItem(storageKey, value.id)
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
  } else if (alive)
    timer = setTimeout(() => {
      void query()
    }, 1000)
}
/** 查询原任务，网络失败不新建任务 */
const query = async () => {
  if (!alive || busy.value || !result.value) return
  busy.value = true
  error.value = ''
  try {
    await observe(await api.request<Result>(`${prefix}/${result.value.id}`))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '结果暂未确认，请查询原任务'
  } finally {
    busy.value = false
  }
}
/** 重新读取完整选择并展示全部名称及跳过原因
 * @param enabled 此次明确选择的目标免费状态
 * @param retry 是否仅预览原任务失败集合
 */
const prepare = async (enabled: boolean, retry = false) => {
  if (busy.value || unknown.value || result.value?.pending) return
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
    preview.value = await api.request<Preview>(`${prefix}/preview`, {
      method: 'POST',
      body: { content_type: props.kind, ids: [...ids], is_free: enabled }
    })
    open.value = true
    pending = null
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预览失败，请重试'
  } finally {
    busy.value = false
  }
}
/** 原请求结果未知时先查持久Operation，仅明确未受理才复用原键和冻结正文 */
const submit = async () => {
  if (busy.value || (!preview.value && !pending)) return
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
  sessionStorage.setItem(operationStorageKey, JSON.stringify(pending))
  emit('processing', true)
  busy.value = true
  error.value = ''
  try {
    let value: Result | undefined
    if (unknown.value) {
      try {
        value = (await api.request<{ result: Result }>(`/api/admin/v1/operations/${pending.key}`))
          .result
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.code !== 'operation_unknown') throw reason
      }
    }
    value ||= await api.request<Result>(pending.path, {
      method: 'POST',
      body: pending.body,
      key: pending.key
    })
    pending = null
    sessionStorage.removeItem(operationStorageKey)
    unknown.value = false
    preview.value = null
    await observe(value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '提交结果未确认，请查询原操作'
    unknown.value =
      reason instanceof ApiError &&
      (['network_unknown', 'response_unknown'].includes(reason.code) || reason.status >= 500)
    if (!unknown.value) {
      emit('processing', false)
      pending = null
      sessionStorage.removeItem(operationStorageKey)
    }
  } finally {
    busy.value = false
  }
}
/** 取消预览不写业务，也不清空列表选择 */
const cancel = () => {
  if (!busy.value && !unknown.value) {
    open.value = false
    preview.value = null
    pending = null
  }
}
/** 关闭结果详情，保留可查询的已提交任务标识 */
const close = () => {
  if (!busy.value && !unknown.value) open.value = false
}
onMounted(async () => {
  const submitted = sessionStorage.getItem(operationStorageKey)
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
      sessionStorage.removeItem(operationStorageKey)
    }
  }
  const id = sessionStorage.getItem(storageKey)
  if (!id) return
  emit('restored')
  busy.value = true
  try {
    open.value = true
    await observe(await api.request<Result>(`${prefix}/${id}`))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '原任务暂未确认'
  } finally {
    busy.value = false
  }
})
onBeforeUnmount(() => {
  alive = false
  if (timer) clearTimeout(timer)
})
</script>
<template>
  <span class="free-batch-controls">
    <ElButton
      class="primary"
      data-action="enable-free"
      :disabled="!ids.length || busy || unknown || Boolean(result?.pending)"
      @click="prepare(true)"
      >批量开启免费</ElButton
    >
    <ElButton
      data-action="disable-free"
      :disabled="!ids.length || busy || unknown || Boolean(result?.pending)"
      @click="prepare(false)"
      >批量关闭免费</ElButton
    >
    <ElButton v-if="result" link @click="open = true">查看本次结果</ElButton>
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
          <ElButton v-if="result?.pending" :loading="busy" @click="query">查询处理进度</ElButton>
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

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { ImportBatch } from '@/shared/types/import'

const props = defineProps<{ batch: ImportBatch }>()
const emit = defineEmits<{ close: []; deleted: [id: string]; refresh: [] }>()
const busy = ref(false),
  unknown = ref(false),
  stale = ref(false),
  error = ref('')
// 一次确认绑定当时的版本，未知回执查询或重试不能采用后台刷新的新版本
const id = props.batch.id,
  names = [...props.batch.source_names],
  body: components['schemas']['DeleteImport'] = { expected_updated_at: props.batch.updated_at },
  key = crypto.randomUUID()
let alive = true
/** 只允许取消尚未提交或已明确失败的删除 */
const close = () => {
  if (!busy.value && !unknown.value) emit('close')
}
/** 删除已确认批次，未知结果先查询原回执，再以原版本和幂等键重试 */
const confirm = async () => {
  if (busy.value || stale.value) return
  busy.value = true
  error.value = ''
  try {
    let receipt: components['schemas']['DeletedImport'] | null = null
    if (unknown.value) {
      try {
        const operation = await api.request<components['schemas']['OperationResponse']>(
          `/api/admin/v1/operations/${key}`
        )
        receipt = operation.result as components['schemas']['DeletedImport']
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
      }
    }
    receipt ||= await api.request<components['schemas']['DeletedImport']>(
      `/api/admin/v1/imports/${encodeURIComponent(id)}`,
      { method: 'DELETE', body, key }
    )
    if (receipt.id !== id || receipt.deleted !== true)
      throw new ApiError('response_unknown', '删除回执暂未确认，请查询原操作结果', 200)
    if (alive) emit('deleted', id)
  } catch (reason) {
    if (!alive) return
    unknown.value =
      !(reason instanceof ApiError) ||
      !reason.status ||
      reason.status >= 500 ||
      [408, 429].includes(reason.status) ||
      reason.code === 'response_unknown'
    stale.value = reason instanceof ApiError && [403, 404, 409].includes(reason.status)
    error.value = reason instanceof Error ? reason.message : '删除结果待确认，请查询原操作'
  } finally {
    if (alive) busy.value = false
  }
}
onBeforeUnmount(() => {
  alive = false
})
</script>
<template>
  <ElDialog
    :model-value="true"
    title="删除未完成导入批次？"
    width="520px"
    align-center
    :close-on-click-modal="false"
    :show-close="!busy && !unknown"
    :close-on-press-escape="!busy && !unknown"
    :before-close="close"
  >
    <p>将删除整个批次的待处理资料，之后无法继续处理此批次。</p>
    <ul class="batch-sources">
      <li v-for="name in names" :key="name">{{ name }}</li>
      <li v-if="!names.length">已保存资料</li>
    </ul>
    <p class="notice">已保存的卡片、素材和用户成绩会保留。</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="stale" class="small muted">批次可能已变化或正在保存卡片，请刷新列表后重新核对。</p>
    <p v-if="unknown" class="small muted">
      删除结果尚未确认，请先查询；查询不到回执时会重试原操作。
    </p>
    <template #footer>
      <button
        type="button"
        data-action="cancel-batch-deletion"
        :disabled="busy || unknown"
        @click="close"
      >
        取消
      </button>
      <button
        v-if="stale"
        type="button"
        class="primary"
        data-action="refresh-batch-deletion"
        @click="emit('refresh')"
      >
        刷新待处理批次
      </button>
      <button
        v-else
        type="button"
        class="primary"
        data-action="confirm-batch-deletion"
        :disabled="busy"
        @click="confirm"
      >
        {{ busy ? '正在确认…' : unknown ? '查询／重试删除' : '确认删除批次' }}
      </button>
    </template>
  </ElDialog>
</template>
<style scoped lang="scss">
.batch-sources {
  max-height: 220px;
  overflow: auto;
  padding-left: 22px;

  li {
    margin: 8px 0;
    overflow-wrap: anywhere;
  }
}
</style>

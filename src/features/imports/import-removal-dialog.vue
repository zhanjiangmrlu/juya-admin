<script setup lang="ts">
import { ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { ImportRemovalSelection, ImportRemoved } from '@/shared/types/import'

const props = defineProps<{ batchId: string; selection: ImportRemovalSelection }>()
const emit = defineEmits<{ close: []; removed: [value: ImportRemoved] }>()
const busy = ref(false),
  error = ref(''),
  unknown = ref(false)
const key = crypto.randomUUID()
// Freeze this confirmation scope; retries must never adopt a later row selection
const kind = props.selection.kind
const rows = props.selection.rows.map((row) => ({ ...row }))
const body =
  kind === 'files'
    ? { file_ids: rows.map((row) => row.id) }
    : { items: rows.map((row) => ({ id: row.id, revision: row.revision! })) }
/** 移除已确认范围，响应未知时复用相同请求以恢复结果 */
const confirm = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.request(`/api/admin/v1/imports/${props.batchId}/${kind}/remove`, {
      method: 'POST',
      body,
      key
    })
    emit('removed', {
      fileIds: kind === 'files' ? rows.map((row) => row.id) : [],
      itemIds: kind === 'items' ? rows.map((row) => row.id) : []
    })
  } catch (reason) {
    unknown.value =
      !(reason instanceof ApiError) ||
      !reason.status ||
      reason.status >= 500 ||
      reason.code === 'response_unknown'
    error.value = reason instanceof Error ? reason.message : '移除结果待确认，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <ElDialog
    :model-value="true"
    title="从本次导入移除"
    width="520px"
    align-center
    :close-on-click-modal="false"
    :show-close="!busy && !unknown"
    :close-on-press-escape="!busy && !unknown"
    :before-close="() => !busy && !unknown && emit('close')"
  >
    <p>
      将移除 {{ rows.length }}
      {{ kind === 'files' ? '个ZIP及其中全部待导入卡片' : '张待导入卡片' }}。
    </p>
    <ul class="removal-names">
      <li v-for="row in rows" :key="row.id">{{ row.name }}</li>
    </ul>
    <p class="notice">仅清除所选资料在本次导入中的核对内容，卡片库已有数据及其他上传文件会保留。</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <template #footer>
      <button type="button" :disabled="busy || unknown" @click="emit('close')">取消</button>
      <button
        type="button"
        class="primary"
        data-action="confirm-import-removal"
        :disabled="busy"
        @click="confirm"
      >
        {{ busy ? '正在移除…' : unknown ? '查询／重试移除' : '确认移除' }}
      </button>
    </template>
  </ElDialog>
</template>
<style scoped lang="scss">
.removal-names {
  max-height: 220px;
  overflow: auto;
  padding-left: 22px;

  li {
    margin: 8px 0;
    overflow-wrap: anywhere;
  }
}
</style>

<script setup lang="ts">
import { ElButton } from 'element-plus'
import { ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'
type FreeAccess = components['schemas']['FreeAccess']
const props = defineProps<{ path: string; isFree: boolean; revision?: number }>()
const emit = defineEmits<{ changed: [value: FreeAccess] }>()
const busy = ref(false),
  unknown = ref(false),
  error = ref('')
let pending: { key: string; body: { is_free: boolean; revision: number } } | null = null
/** 查询真实免费状态，冲突时恢复服务端值而不乐观翻转 */
const refresh = async () => {
  emit('changed', await api.request<FreeAccess>(props.path))
}
/** 只提交本行固定免费动作，未知结果先查原回执再复用原键 */
const change = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (!pending) {
      const current =
        props.revision === undefined
          ? await api.request<FreeAccess>(props.path)
          : { is_free: props.isFree, revision: props.revision }
      pending = {
        key: crypto.randomUUID(),
        body: { is_free: !current.is_free, revision: current.revision }
      }
    }
    let result: FreeAccess | undefined
    if (unknown.value) {
      try {
        result = (
          await api.request<{ result: FreeAccess }>(`/api/admin/v1/operations/${pending.key}`)
        ).result
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.code !== 'operation_unknown') throw reason
        await refresh()
      }
    }
    result ||= await api.request<FreeAccess>(props.path, {
      method: 'PUT',
      body: pending.body,
      key: pending.key
    })
    unknown.value = false
    pending = null
    emit('changed', result)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '免费设置失败，请重试'
    unknown.value =
      reason instanceof ApiError &&
      (['network_unknown', 'response_unknown'].includes(reason.code) || reason.status >= 500)
    if (!unknown.value) {
      pending = null
      try {
        await refresh()
      } catch {
        /* 保留原显示和错误，刷新失败不假定提交成功 */
      }
    }
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <span class="free-access-control">
    <ElButton link :type="isFree ? 'danger' : 'primary'" :loading="busy" @click="change">
      {{ unknown ? '查询本次结果' : isFree ? '关闭免费' : '启用免费' }}
    </ElButton>
    <small v-if="error" role="alert">{{ error }}</small>
  </span>
</template>
<style scoped lang="scss">
.free-access-control {
  display: inline-flex;
  flex-direction: column;
  align-items: start;

  small {
    max-width: 200px;
    color: var(--danger);
    white-space: normal;
  }
}
</style>

<script setup lang="ts">
/* global AbortController */
import { onBeforeUnmount, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { type CloudUsageRow, mapCloudUsage } from './cloud-usage-model'

const props = defineProps<{ period: string }>()
const client = useAdminApiClient()
const rows = ref<CloudUsageRow[]>([]),
  imports = ref<number | null>(null),
  error = ref(''),
  busy = ref(false)
let request: AbortController | null = null
let generation = 0
const /** 从真实按日接口读取只读导入与用量汇总 * @returns 当前操作结果或完成状态
   */ load = async (): Promise<void> => {
    request?.abort()
    request = new AbortController()
    const current = ++generation
    rows.value = []
    imports.value = null
    error.value = ''
    busy.value = true
    try {
      const raw = await client.request<Record<string, unknown>>({
        method: 'GET',
        path: '/api/v1/admin/content/usage',
        query: { period: props.period },
        signal: request.signal
      })
      if (current !== generation) return
      const result = mapCloudUsage(raw)
      rows.value = result.rows
      imports.value = result.importBatches
    } catch (failure) {
      if (current === generation && !request.signal.aborted)
        error.value = failure instanceof Error ? failure.message : '用量汇总读取失败'
    } finally {
      if (current === generation) busy.value = false
    }
  }
watch(
  () => props.period,
  () => void load(),
  { immediate: true }
)
onBeforeUnmount(() => {
  generation++
  request?.abort()
  rows.value = []
})
</script>

<template>
  <AdminPanel
    class="cloud-usage-panel"
    title="导入与云端用量"
    :description="`${period} · 北京时间自然日 · 只读汇总`"
  >
    <ElAlert v-if="error" :title="error" :closable="false" type="error" />
    <ElSkeleton v-if="busy" :rows="3" animated />
    <template v-else
      ><p>当日导入批次：{{ imports ?? '—' }}</p>
      <ElTable :data="rows" empty-text="暂无已记录用量"
        ><ElTableColumn label="处理类型" prop="name" min-width="140" /><ElTableColumn
          label="调用次数"
          prop="attempts"
          width="100"
        /><ElTableColumn label="预留用量" prop="reserved" min-width="150" /><ElTableColumn
          label="实测用量"
          prop="actual"
          min-width="150"
        /><ElTableColumn label="结果待核对次数" min-width="140"
          ><template #default="{ row }">{{ row.unknown ?? '—' }}</template></ElTableColumn
        ></ElTable
      ></template
    >
    <p class="usage-note">
      实测用量以实际记录为准，预留量不等于供应商账单。尚无本批费用、切片计算、存储、下载流量与缓存命中记录时保留为空。
    </p>
  </AdminPanel>
</template>

<style scoped lang="scss">
.cloud-usage-panel {
  margin-top: 20px;

  p {
    font-size: 14px;
    line-height: 22px;
  }

  .usage-note {
    margin: 14px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }
}
</style>

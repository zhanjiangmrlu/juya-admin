<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import { candidateHash, createProofreadingAdapter } from './proofreading-adapter'

const props = defineProps<{
  candidates: {
    revisionId: string
    contentType: string
    version?: number
    title: string
    content: Record<string, unknown>
  }[]
}>()
const emit = defineEmits<{ saved: [] }>()
const adapter = createProofreadingAdapter(useAdminApiClient())
const eligible = computed(() =>
  props.candidates.filter(
    (row) => row.contentType !== 'short_reading' && row.content.schema_version === 2 && row.version
  )
)
const checked = ref(false)
const busy = ref(false)
const error = ref('')
const results = ref<{ revision_id: string; status: string; error_code?: string }[]>([])
let generation = 0
let disposed = false
watch(
  () => JSON.stringify(props.candidates),
  () => {
    checked.value = false
    generation++
  }
)
onBeforeUnmount(() => {
  disposed = true
  generation++
})
const /** 对明确选中的新版草稿集中确认词条，部分失败逐项展示 */ confirm =
    async (): Promise<void> => {
      if (busy.value || !checked.value || !eligible.value.length) return
      busy.value = true
      error.value = ''
      const token = generation
      try {
        const candidates = await Promise.all(
          eligible.value.map(async (row) => ({
            revision_id: row.revisionId,
            expected_version: row.version!,
            candidate_hash: await candidateHash(row.content)
          }))
        )
        if (disposed || token !== generation) return
        const result = await adapter.confirmEntries(candidates)
        if (disposed || token !== generation) return
        results.value = result.items
        checked.value = false
        emit('saved')
      } catch (failure) {
        if (!disposed && token === generation)
          error.value = failure instanceof Error ? failure.message : '词条确认失败'
      } finally {
        busy.value = false
      }
    }
</script>
<template>
  <AdminPanel v-if="eligible.length" title="选中草稿的本篇词条集中确认">
    <p>
      范围为以下
      {{ eligible.length }}
      篇新版场景或词汇卡；短文不进入词条确认。此操作会撤销这些候选旧的抽样批准，随后需重新建立校对集合。
    </p>
    <p v-for="row in eligible" :key="row.revisionId">
      {{ row.title }} · 编辑版本 {{ row.version }}
    </p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElCheckbox v-model="checked" :disabled="busy">已逐篇核对全部本篇词条的义项与来源</ElCheckbox>
    <ElButton :disabled="!checked || busy" :loading="busy" @click="confirm"
      >确认明确选中草稿的本篇词条</ElButton
    >
    <p v-for="row in results" :key="row.revision_id">
      {{ candidates.find((item) => item.revisionId === row.revision_id)?.title || row.revision_id }}
      · {{ row.status === 'SUCCESS' ? '已确认' : '未确认' }} {{ row.error_code }}
    </p>
  </AdminPanel>
</template>

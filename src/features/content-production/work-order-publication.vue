<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S, WorkItem } from './work-order-model'

import { productionLabels, publicationRetryIds } from './work-order-model'
const props = defineProps<{
  state: S['PublicationState']
  items: WorkItem[]
  busy: boolean
  held: number
}>()
const emit = defineEmits<{ confirm: [retry: boolean] }>()
const checked = ref(false)
watch(
  () => [props.state.token, props.state.collection_hash],
  () => {
    checked.value = false
  }
)
const failed = computed(() => publicationRetryIds(props.state.results))
const succeeded = computed(
  () => props.state.results.filter((row) => row.status === 'SUCCEEDED').length
)
const /** 按固定版本查找真实篇目名称
   * @param revisionId - 发布范围内的固定候选版本
   * @returns 可读内容标题
   */
  title = (revisionId: string): string => {
    const item = props.items.find((row) => row.revision_id === revisionId)
    return item?.title_en || item?.title_zh || '本批内容'
  }
</script>
<template>
  <div class="publication-workspace">
    <div class="metrics">
      <span
        >本次范围 <b>{{ state.candidates.length }}</b></span
      ><span
        >发布成功 <b>{{ succeeded }}</b></span
      ><span
        >发布失败 / 待核实 <b>{{ failed.length }}</b></span
      ><span
        >继续保留草稿 <b>{{ held }}</b></span
      >
    </div>
    <AdminPanel :title="state.results.length ? '逐篇发布结果' : '确认本次发布范围'"
      ><ElTable v-if="state.results.length" :data="state.results"
        ><ElTableColumn label="内容标题" min-width="220"
          ><template #default="{ row }">{{ title(row.revision_id) }}</template></ElTableColumn
        ><ElTableColumn label="发布状态"
          ><template #default="{ row }">{{
            productionLabels[row.status] || '处理中'
          }}</template></ElTableColumn
        ><ElTableColumn label="后续处理"
          ><template #default="{ row }">{{
            row.status === 'SUCCEEDED'
              ? '成功已保留'
              : row.error_code
                ? '请检查当前内容与资源，修正后重试'
                : '刷新查看最终结果'
          }}</template></ElTableColumn
        ></ElTable
      ><ElTable v-else :data="state.candidates"
        ><ElTableColumn label="内容标题" min-width="220"
          ><template #default="{ row }">{{ title(row.revision_id) }}</template></ElTableColumn
        ><ElTableColumn label="确认依据"
          ><template #default>服务端已核验当前候选合格</template></ElTableColumn
        ></ElTable
      ><ElCheckbox v-model="checked">已核对本次发布范围与来源 / 版权备注</ElCheckbox></AdminPanel
    >
    <div class="notice">
      仅发布此处预览的合格内容，其余项目继续保留草稿。失败重试保留已经成功的内容。
    </div>
    <div class="actions">
      <ElButton
        v-if="failed.length"
        type="primary"
        :disabled="busy || !checked"
        @click="emit('confirm', true)"
        >仅重试 {{ failed.length }} 篇发布失败 / 待核实结果</ElButton
      ><ElButton
        v-else-if="!state.results.length"
        type="primary"
        :disabled="busy || !checked || !state.candidates.length"
        @click="emit('confirm', false)"
        >确认发布 {{ state.candidates.length }} 篇</ElButton
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.publication-workspace {
  display: grid;
  gap: 20px;

  .metrics {
    display: flex;
    gap: 24px;
    padding: 20px;
    background: var(--juya-color-surface);
    border-radius: 18px;
    flex-wrap: wrap;
  }

  .notice {
    padding: 20px;
    background: var(--juya-color-primary-soft);
    border-radius: 16px;
    line-height: 1.8;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
}
</style>

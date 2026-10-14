<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import AppPageActions from '@/components/app-page-actions/app-page-actions.vue'

import type { ProductionSchema as S, WorkItem } from './work-order-model'

import { productionLabels, publicationRetryIds } from './work-order-model'
import { publicationDraftCounts } from './work-order-publication-scope'
const props = defineProps<{
  state: S['PublicationState']
  items: WorkItem[]
  busy: boolean
  membersReady: boolean
  pendingCommands?: S['PendingCommand'][]
  contentType?: S['WorkOrder']['content_type']
}>()
const emit = defineEmits<{
  confirm: [retry: boolean]
  refresh: []
  resume: [commandId: string]
  tasks: []
  back: []
  published: []
}>()
const checked = ref(false)
watch(
  () => [props.state.token, props.state.collection_hash, props.state.version],
  () => {
    checked.value = false
  }
)
const failed = computed(() => publicationRetryIds(props.state.results))
const failedRows = computed(() => props.state.results.filter((row) => row.status === 'FAILED'))
const unresolved = computed(() =>
  props.state.results.filter((row) => !['FAILED', 'SUCCEEDED'].includes(row.status))
)
const preview = computed(() => props.state.status === 'PREVIEW' && !props.state.results.length)
const pending = computed(() => ['QUEUED', 'RUNNING'].includes(props.state.status))
const unknown = computed(() => props.state.results.filter((row) => row.status === 'UNKNOWN'))
const drafts = computed(() => publicationDraftCounts(props.state, props.items, props.membersReady))
const metrics = computed(() =>
  preview.value
    ? [
        { label: '本次可发布', value: props.state.candidates.length },
        { label: '仍需校对', value: drafts.value?.review },
        { label: '处理失败', value: drafts.value?.failed },
        { label: '本次保留草稿', value: drafts.value?.held }
      ]
    : [
        { label: '已发布', value: succeeded.value },
        { label: '发布失败', value: failed.value.length },
        { label: '仍需校对', value: drafts.value?.review },
        { label: '处理失败', value: drafts.value?.failed }
      ]
)
const receipts = computed(() =>
  (props.pendingCommands || []).filter((command) =>
    ['publication-confirm', 'publication-retry'].includes(command.action)
  )
)
const succeeded = computed(
  () => props.state.results.filter((row) => row.status === 'SUCCEEDED').length
)
const /** 仅在完整候选内容与类型身份一致时复用冻结标题
   * @param revisionId - 发布范围内的固定候选版本
   * @returns 可读内容标题
   */
  title = (revisionId: string): string => {
    const candidate = props.state.candidates.find((row) => row.revision_id === revisionId)
    const matches = props.items.filter(
      (row) =>
        candidate?.candidate_hash &&
        candidate.content_type === props.contentType &&
        row.work_order_id === props.state.work_order_id &&
        row.content_id === candidate.content_id &&
        row.revision_id === revisionId &&
        row.candidate_hash === candidate.candidate_hash
    )
    const item = matches.length === 1 ? matches[0] : undefined
    return item?.title_en || item?.title_zh || '原冻结候选（原标题暂无法核验）'
  }
const /** 显示原冻结内容与版本身份，供原标题暂无法核验时核对
   * @param revisionId - 逐项结果指向的冻结版本
   * @returns 实际内容与版本编号
   */ identity = (revisionId: string): string => {
    const candidate = props.state.candidates.find((row) => row.revision_id === revisionId)
    return [candidate?.content_id, revisionId].filter(Boolean).join(' · ')
  }
const /** 保留服务端错误代码，并仅对已确认契约解释具体问题
   * @param code - 逐项发布的真实错误代码
   * @returns 问题说明与可核对的原代码
   */ problem = (code: string | null | undefined): string => {
    if (!code) return '服务端尚未提供具体问题，请刷新结果'
    const messages: Record<string, string> = {
      PUBLICATION_PREVIEW_STALE: '候选版本或资料已变化，请核对原冻结版本',
      PUBLICATION_CANDIDATE_NOT_READY: '候选尚未满足发布条件',
      PUBLICATION_ITEM_RESULT_UNKNOWN: '发布结果待核实，请查看原任务与回执'
    }
    return messages[code] ? `${messages[code]}（${code}）` : `服务端返回：${code}；请核对原任务结果`
  }
</script>
<template>
  <div class="publication-workspace">
    <div class="metrics">
      <article v-for="metric in metrics" :key="metric.label">
        <strong>{{ metric.value ?? '待核实' }}</strong
        ><span>{{ metric.label }}</span>
      </article>
    </div>
    <p class="scope-caption">
      {{
        preview ? '本次可发布按原预览合格版本计算；' : '已发布 / 发布失败按本次冻结结果计算；'
      }}仍需校对 / 处理失败为当前批次未纳入本次范围的草稿{{
        !membersReady ? '，完整成员尚未读取' : ''
      }}。
    </p>
    <AdminPanel :title="preview ? '本次发布内容' : '发布失败项目'"
      ><p v-if="!preview && !state.results.length" role="status">
        {{ pending ? '本次发布已提交，等待逐篇结果' : '尚无逐篇结果，请刷新原发布任务状态' }}
      </p>
      <ElTable
        v-if="!preview"
        class="publication-failed-table"
        :data="failedRows"
        empty-text="本次尚无明确失败项目"
        ><ElTableColumn label="内容标题" min-width="220"
          ><template #default="{ row }"
            >{{ title(row.revision_id)
            }}<small class="candidate-identity">{{ identity(row.revision_id) }}</small></template
          ></ElTableColumn
        ><ElTableColumn label="问题" min-width="300"
          ><template #default="{ row }">{{ problem(row.error_code) }}</template></ElTableColumn
        ><ElTableColumn label="当前状态" min-width="180"
          ><template #default>保留原合格候选</template></ElTableColumn
        ><ElTableColumn label="操作" min-width="180"
          ><template #default>仅重试明确失败项</template></ElTableColumn
        ></ElTable
      ><ElTable v-else :data="state.candidates"
        ><ElTableColumn label="内容标题" min-width="220"
          ><template #default="{ row }"
            >{{ title(row.revision_id)
            }}<small class="candidate-identity">{{ identity(row.revision_id) }}</small></template
          ></ElTableColumn
        ><ElTableColumn label="确认依据"
          ><template #default>服务端已核验当前候选合格</template></ElTableColumn
        ></ElTable
      ><ElCheckbox v-if="preview" v-model="checked"
        >已核对本次发布范围与来源 / 版权备注</ElCheckbox
      ></AdminPanel
    >
    <div class="notice">
      <strong v-if="!preview && succeeded">成功已保留</strong>
      {{
        preview
          ? '仅发布此处预览的合格内容，其余项目继续保留草稿。每篇启用完整内容版本。'
          : '成功步骤会复用。重试仅处理明确失败篇目，不回滚成功内容，不重复创建有效版本。'
      }}
      <p v-if="unknown.length">
        {{ unknown.length }} 篇结果待核实，未计入发布失败。请刷新并核对原任务回执。
      </p>
    </div>
    <AdminPanel
      v-if="!preview && unresolved.length"
      class="publication-unknown"
      title="待核实与处理中结果"
    >
      <p>这些结果未计入发布失败，请刷新并核对原任务回执。</p>
      <ElTable :data="unresolved">
        <ElTableColumn label="内容标题" min-width="220">
          <template #default="{ row }"
            >{{ title(row.revision_id)
            }}<small class="candidate-identity">{{ identity(row.revision_id) }}</small></template
          >
        </ElTableColumn>
        <ElTableColumn label="实际状态" min-width="140">
          <template #default="{ row }">{{
            row.status === 'UNKNOWN' ? '待核实' : productionLabels[row.status] || row.status
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="原回执问题" min-width="300">
          <template #default="{ row }">{{ problem(row.error_code) }}</template>
        </ElTableColumn>
      </ElTable>
    </AdminPanel>
    <AdminPanel v-if="!preview" title="后续校对">
      <p>
        当前批次未纳入本次范围的草稿：{{ drafts?.held ?? '待核实' }} 篇。其中
        {{ drafts?.review ?? '待核实' }} 篇仍需校对，{{ drafts?.failed ?? '待核实' }}
        篇处理失败可从批量任务查看。旧已发布版本与资源继续保留。
      </p>
      <p v-if="state.stage_id">原发布任务：{{ state.stage_id }}</p>
      <div class="receipt">
        <ElButton :disabled="busy" @click="emit('refresh')">刷新发布结果</ElButton
        ><ElButton :disabled="busy" @click="emit('tasks')">查看原发布任务</ElButton>
      </div>
      <div v-for="receipt in receipts" :key="receipt.command_id" class="receipt">
        <span>原操作回执：{{ receipt.command_id }}</span>
        <ElButton
          :disabled="busy || Date.parse(receipt.retry_at) > Date.now()"
          @click="emit('resume', receipt.command_id)"
          >续办原操作回执</ElButton
        >
      </div>
    </AdminPanel>
    <AppPageActions>
      <ElButton v-if="preview" :disabled="busy" @click="emit('back')">返回校对</ElButton>
      <ElButton v-else :disabled="busy" @click="emit('published')">查看已发布内容</ElButton>
      <ElButton
        v-if="!preview && failed.length"
        type="primary"
        :disabled="busy || pending || !membersReady"
        @click="emit('confirm', true)"
        >仅重试 {{ failed.length }} 篇发布失败</ElButton
      ><ElButton
        v-else-if="preview"
        type="primary"
        :disabled="busy || !membersReady || !checked || !state.candidates.length"
        @click="emit('confirm', false)"
        >确认发布 {{ state.candidates.length }} 篇</ElButton
      >
    </AppPageActions>
  </div>
</template>
<style scoped lang="scss">
.publication-workspace {
  display: grid;
  gap: 20px;

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    article {
      display: grid;
      gap: 8px;
      min-height: 100px;
      padding: 12px 20px;
      background: var(--juya-color-surface);
      border-radius: 18px;

      strong {
        font-size: 26px;
        line-height: 39px;
        font-variant-numeric: tabular-nums;
        color: var(--juya-color-sidebar);
      }

      span {
        font-size: 11px;
        color: var(--juya-color-text-regular);
      }
    }
  }

  .scope-caption {
    margin: 0;
    color: var(--juya-color-text-regular);
    font-size: 13px;
    line-height: 1.8;
  }

  .candidate-identity {
    display: block;
    color: var(--juya-color-text-regular);
    overflow-wrap: anywhere;
  }

  .notice {
    padding: 20px;
    background: var(--juya-color-primary-soft);
    border-radius: 16px;
    line-height: 1.8;

    strong {
      display: block;
      margin-bottom: 8px;
    }
  }

  .receipt {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  @media (width <= 800px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

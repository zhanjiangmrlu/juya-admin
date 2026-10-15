<script setup lang="ts">
import { computed, ref } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import { productionLabels, stageLabels } from './work-order-model'
const props = defineProps<{
  order: WorkOrder
  phases: S['WorkOrderPhases'] | null
  usage: S['WorkOrderUsage'] | null
  items: WorkItem[]
  busy: boolean
}>()
const emit = defineEmits<{ retry: [item: WorkItem, task: S['WorkTask']]; resume: [id: string] }>()
const metrics = ['total', 'normal', 'review_required', 'failed'] as const
const failedOpened = ref(false)
const failed = computed(() =>
  (props.phases?.phases || [])
    .flatMap((phase) => phase.retryable || [])
    .flatMap((reference) => {
      const item = props.items.find((row) => row.item_id === reference.item_id)
      const task = item?.tasks?.find(
        (row) =>
          row.stage_id === reference.stage_id &&
          row.current &&
          row.status === 'FAILED' &&
          row.error_code !== 'PROVIDER_OUTCOME_UNKNOWN' &&
          row.retryable
      )
      return item && task ? [{ item, task }] : []
    })
)
const paidUnknown = computed(() =>
  props.items.some((item) =>
    item.tasks?.some((task) => task.current && task.error_code === 'PROVIDER_OUTCOME_UNKNOWN')
  )
)
const plans = computed(() => [...(props.usage?.planned || []), ...(props.usage?.potential || [])])
const phaseLabels: Record<string, string> = {
  succeeded: '已完成',
  failed: '失败',
  processing: '处理中',
  review_required: '待核对',
  unknown: '尚待核实',
  not_applicable: '不适用',
  cancelled: '已取消'
}
/**
 * 将权威阶段计数组合成可读结果
 * @param counts - 同阶段全批互斥计数
 * @returns 阶段结果
 */
const phaseResult = (counts: S['PhaseCounts']): string =>
  Object.entries(counts)
    .filter(([key, value]) => key !== 'total' && value)
    .map(([key, value]) => `${value} 篇${phaseLabels[key]}`)
    .join('，') || '尚无篇目'
/**
 * 从实际调用记录显示已知计量及缺测范围
 * @param field - 供应商保存的输入或输出Token字段
 * @returns 实际已知计量或未知状态，并说明未测调用数量
 */
const actualTokens = (field: 'input_tokens' | 'output_tokens'): string => {
  const attempts = props.usage?.attempts.filter((row) => row.kind === 'AI_TOKENS') || []
  if (!attempts.length) return '尚无计量记录'
  const known = attempts.filter((row) => row[field] !== null && row[field] !== undefined)
  const missing = attempts.length - known.length
  if (!known.length) return `未知（${missing} 次调用待核实）`
  const total = known.reduce((sum, row) => sum + Number(row[field]), 0)
  return missing ? `已知部分 ${total}（${missing} 次调用待核实）` : String(total)
}
defineExpose({ failedOpened })
</script>
<template>
  <div class="work-tasks">
    <div class="metrics">
      <article v-for="key in metrics" :key="key">
        <strong>{{ order.counts[key] }}</strong
        ><span>{{ productionLabels[key] }}</span>
      </article>
    </div>
    <AdminPanel :title="`${order.series_title} · 导入任务`"
      ><ElTable :data="phases?.phases || []" empty-text="阶段证据尚未加载，请刷新本批">
        <ElTableColumn prop="label" label="阶段" min-width="280" /><ElTableColumn
          label="结果"
          min-width="370"
          ><template #default="{ row }">{{ phaseResult(row.counts) }}</template></ElTableColumn
        ><ElTableColumn label="状态" min-width="240"
          ><template #default="{ row }">{{
            row.counts.processing
              ? '处理中'
              : row.counts.failed
                ? '可查看失败阶段'
                : row.counts.unknown
                  ? '待人工核实'
                  : row.counts.review_required
                    ? '待人工核对'
                    : '已有明确结果'
          }}</template></ElTableColumn
        >
      </ElTable></AdminPanel
    >
    <ElAlert
      v-if="paidUnknown"
      title="付费调用结果待人工核实，不可重新提交"
      type="info"
      :closable="false"
    />
    <AdminPanel v-if="usage" title="本批用量记录">
      <p>
        正文范围：{{ usage.source_text_count }} 篇可读取，{{
          usage.source_unknown_count
        }}
        篇待补依据；已读正文 {{ usage.source_text_utf8_bytes ?? '未知' }} UTF-8 字节
      </p>
      <p>
        实际可解码素材音频：{{
          usage.measured_audio_ms === null || usage.measured_audio_ms === undefined
            ? '尚无已测时长'
            : `${usage.measured_audio_ms / 1000} 秒`
        }}（相同素材计一次）；{{ usage.audio_unknown_count }} 个引用待核实
      </p>
      <p>
        实际调用：输入 {{ actualTokens('input_tokens') }} · 输出
        {{ actualTokens('output_tokens') }} · 已重试 {{ usage.retry_count }} 次 ·
        {{ usage.unknown_count }} 次结果待核实
      </p>
      <p
        v-if="
          usage.known_list_price_subtotal_cny !== null &&
          usage.known_list_price_subtotal_cny !== undefined
        "
      >
        实际用量对应公开原价估算：已知部分 ¥{{ usage.known_list_price_subtotal_cny }}，{{
          usage.unpriced_attempt_count
        }}
        次调用未估算
      </p>
      <p v-else>实际用量费用尚不能完整估算</p>
      <ElTable v-if="plans.length" :data="plans"
        ><ElTableColumn label="预计处理范围" min-width="210"
          ><template #default="{ row }"
            >{{
              row.planning_status === 'potential' ? '潜在一次调用（尚未安排）' : '已规划一次调用'
            }}
            · {{ row.kind === 'AI_LEXICON' ? '可选词条推荐' : '音频识别' }}</template
          ></ElTableColumn
        ><ElTableColumn label="保守用量上界" min-width="250"
          ><template #default="{ row }">{{
            row.kind === 'AI_LEXICON'
              ? `输入 ${row.input_tokens_upper_bound ?? '未知'} / 输出 ${row.output_tokens_upper_bound ?? '未知'} Token`
              : `${row.measured_audio_ms === null ? '未知' : Math.ceil(row.measured_audio_ms / 1000)} 秒音频`
          }}</template></ElTableColumn
        ><ElTableColumn label="公开原价估算" min-width="220"
          ><template #default="{ row }">{{
            row.list_price_estimate.amount_cny === null
              ? row.list_price_estimate.unknown_reason
              : `¥${row.list_price_estimate.amount_cny}`
          }}</template></ElTableColumn
        ></ElTable
      >
      <p v-else>
        尚无可计算的未来调用范围。导入保存草稿不代表已安排可选推荐，短文不生成词库候选或场景对齐。
      </p>
      <small
        >上界按当前可计算范围的一次调用估算，已完成调用不重复计入未来费用；缺模型、地域或计量保持未知。公开原价估算与供应商账单不同，未计优惠、重试、切片、存储和流量。</small
      >
      <details>
        <summary>价格来源与适用范围</summary>
        <p>北京地域，qwen-flash / qwen3-asr-flash-filetrans，2026-10-14 核验公开原价</p>
        <a
          href="https://help.aliyun.com/zh/model-studio/model-pricing"
          target="_blank"
          rel="noopener"
          >官方模型价格</a
        >
        <p>文本是实际请求模板的保守 Token 上界，未使用精确分词器；音频估算沿现有预算向上取整秒。</p>
      </details>
    </AdminPanel>
    <AdminPanel v-if="order.pending_commands?.length" title="仍在处理的操作"
      ><ElButton
        v-for="command in order.pending_commands"
        :key="command.command_id"
        :disabled="busy || Date.parse(command.retry_at) > Date.now()"
        @click="emit('resume', command.command_id)"
        >继续核实结果</ElButton
      ></AdminPanel
    >
    <ElDialog v-model="failedOpened" title="本批可重试失败阶段"
      ><ElTable :data="failed" empty-text="没有可重试失败阶段，成功步骤继续复用"
        ><ElTableColumn label="篇目"
          ><template #default="{ row }">{{
            row.item.title_en || row.item.title_zh
          }}</template></ElTableColumn
        ><ElTableColumn label="失败阶段"
          ><template #default="{ row }">{{
            stageLabels[row.task.stage] || '内容处理'
          }}</template></ElTableColumn
        ><ElTableColumn label="操作"
          ><template #default="{ row }"
            ><ElButton
              link
              type="primary"
              :disabled="busy"
              @click="emit('retry', row.item, row.task)"
              >仅重试此失败阶段</ElButton
            ></template
          ></ElTableColumn
        ></ElTable
      ></ElDialog
    >
  </div>
</template>
<style scoped lang="scss">
.work-tasks {
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
      border-radius: 18px;
      background: var(--juya-color-surface);

      strong {
        font-size: 26px;
        line-height: 39px;
        color: var(--juya-color-sidebar);
      }

      span {
        font-size: 11px;
        color: var(--juya-color-text-secondary);
      }
    }
  }

  p {
    line-height: 22px;
    margin-block: 8px;
  }

  small {
    color: var(--juya-color-text-secondary);
    line-height: 18px;
  }

  details {
    margin-top: 12px;
  }

  @media (width <= 800px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

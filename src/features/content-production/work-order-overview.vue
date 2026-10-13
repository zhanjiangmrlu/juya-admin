<script setup lang="ts">
import { computed } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import { issueAction, productionLabels, stageLabels } from './work-order-model'
const props = defineProps<{
  order: WorkOrder
  items: WorkItem[]
  busy: boolean
  usage?: S['WorkOrderUsage'] | null
}>()
const emit = defineEmits<{
  edit: [item: WorkItem, issue?: S['WorkIssue']]
  resume: [id: string]
  retry: [item: WorkItem, task: S['WorkTask']]
}>()
const mainMetrics = ['normal', 'review_required', 'failed', 'publishable'] as const
const secondaryMetrics = ['total', 'processing', 'confirmed', 'published', 'cancelled'] as const
const tasks = computed(() =>
  props.items.flatMap((item) =>
    (item.tasks || []).filter((task) => task.current).map((task) => ({ item, task }))
  )
)
const /** 展示问题字段与位置
   * @param locations - 服务端返回的原文与字段位置
   * @returns 可读业务位置
   */ locationLabel = (locations: string[]): string =>
    locations
      .map(
        (value) =>
          (
            ({
              dialogue: '句子',
              chinese: '中文',
              english: '英文',
              vocabulary: '词汇',
              chunks: '语块',
              paragraphs_en: '英文段落',
              translation_zh: '全文译文'
            }) as Record<string, string>
          )[value] || (/^\d+$/.test(value) ? `第 ${Number(value) + 1} 项` : '对应字段')
      )
      .join(' · ')
</script>
<template>
  <div class="work-overview">
    <div class="metrics">
      <article v-for="key in mainMetrics" :key="key">
        <strong>{{ order.counts[key] || 0 }}</strong
        ><span>{{ productionLabels[key] }}</span>
      </article>
    </div>
    <div class="secondary-counts">
      <span v-for="key in secondaryMetrics" :key="key"
        >{{ productionLabels[key] }} <b>{{ order.counts[key] || 0 }}</b></span
      >
    </div>
    <AdminPanel v-if="order.pending_commands?.length" title="仍在处理的操作">
      <p>离开或刷新后可继续查看。结果未确定的操作，请等待或续办当前记录。</p>
      <div v-for="pending in order.pending_commands" :key="pending.command_id" class="pending-row">
        <span>{{ stageLabels[pending.action] || '内容处理' }} · 等待结果</span
        ><ElButton
          :disabled="busy || Date.parse(pending.retry_at) > Date.now()"
          @click="emit('resume', pending.command_id)"
          >继续核实结果</ElButton
        >
      </div>
    </AdminPanel>
    <AdminPanel title="本批篇目与待处理问题">
      <ElTable :data="items" empty-text="当前条件下没有篇目，可切换筛选或刷新处理进度">
        <ElTableColumn label="篇目" min-width="190"
          ><template #default="{ row }"
            ><strong>{{ row.title_en || row.title_zh || '等待解析正文' }}</strong
            ><small>{{ row.title_zh }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="状态" width="160"
          ><template #default="{ row }"
            ><span>{{ productionLabels[row.lifecycle_status] || '草稿' }}</span
            ><small>{{ productionLabels[row.production_status] }}</small></template
          ></ElTableColumn
        >
        <ElTableColumn label="问题位置与说明" min-width="270"
          ><template #default="{ row }"
            ><div v-for="issue in row.issues" :key="issue.id" class="issue">
              <span>{{ issue.message }}</span
              ><small>{{ locationLabel(issue.location || []) }}</small>
            </div>
            <span v-if="!row.issues?.length">{{
              row.production_status === 'processing' ? '正在处理，请稍后刷新' : '当前无阻断问题'
            }}</span></template
          ></ElTableColumn
        >
        <ElTableColumn label="修正入口" min-width="160"
          ><template #default="{ row }"
            ><ElButton
              v-for="issue in row.issues"
              :key="issue.id"
              link
              type="primary"
              :disabled="busy"
              @click="emit('edit', row, issue)"
              >{{ issueAction(issue.correction_target).label }}</ElButton
            ><ElButton v-if="!row.issues?.length" link type="primary" @click="emit('edit', row)"
              >查看与编辑</ElButton
            ></template
          ></ElTableColumn
        >
      </ElTable>
    </AdminPanel>
    <div class="qualification">
      <strong>待发布条件</strong>
      <p>
        正常 {{ order.counts.normal || 0 }} 篇完成抽样后可批量确认。需校对
        {{ order.counts.review_required || 0 }} 篇分别修正；处理失败
        {{ order.counts.failed || 0 }} 篇可单独重试。未完成项目保留草稿。
      </p>
    </div>
    <AdminPanel v-if="tasks.length" title="本页篇目处理进度"
      ><ElTable :data="tasks"
        ><ElTableColumn label="篇目" min-width="180"
          ><template #default="{ row }">{{
            row.item.title_en || row.item.title_zh
          }}</template></ElTableColumn
        ><ElTableColumn label="阶段" min-width="180"
          ><template #default="{ row }">{{
            stageLabels[row.task.stage] || '内容处理'
          }}</template></ElTableColumn
        ><ElTableColumn label="状态"
          ><template #default="{ row }">{{
            productionLabels[row.task.status] || '等待核实'
          }}</template></ElTableColumn
        ><ElTableColumn label="操作"
          ><template #default="{ row }"
            ><ElButton
              v-if="row.task.retryable"
              link
              :disabled="busy"
              @click="emit('retry', row.item, row.task)"
              >重试失败步骤</ElButton
            ></template
          ></ElTableColumn
        ></ElTable
      ></AdminPanel
    >
    <AdminPanel v-if="usage" title="本批关联用量"
      ><p>
        关联处理记录共 {{ usage.attempts.length }} 次调用，实际重试
        {{ usage.retry_count }} 次，结果待核实 {{ usage.unknown_count }} 次。费用尚无已确认费率。
      </p>
      <ElTable :data="usage.attempts"
        ><ElTableColumn label="用途"
          ><template #default="{ row }">{{
            row.kind === 'AI_TOKENS' ? '词条推荐' : '音频识别'
          }}</template></ElTableColumn
        ><ElTableColumn label="实际计量"
          ><template #default="{ row }">{{
            row.actual_units ?? '尚未测得'
          }}</template></ElTableColumn
        ><ElTableColumn prop="reserved_units" label="原预留量" /><ElTableColumn label="状态"
          ><template #default="{ row }">{{
            productionLabels[row.status] || '等待结算'
          }}</template></ElTableColumn
        ></ElTable
      ><small
        >关联记录可能包含历史处理或缓存复用，不代表本次新增收费；未知用量不按零计算。</small
      ></AdminPanel
    >
  </div>
</template>
<style scoped lang="scss">
.work-overview {
  display: grid;
  gap: 20px;

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    article {
      display: grid;
      gap: 8px;
      padding: 12px 20px;
      background: var(--juya-color-surface);
      border-radius: 18px;

      strong {
        font-size: 26px;
        line-height: 39px;
        color: var(--juya-color-sidebar);
      }

      span {
        font-size: 12px;
        color: var(--juya-color-text-regular);
      }
    }
  }

  .secondary-counts {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    color: var(--juya-color-text-regular);
    font-size: 13px;
  }

  small {
    display: block;
    margin-top: 6px;
    color: var(--juya-color-text-regular);
    line-height: 1.6;
  }

  .issue + .issue {
    margin-top: 12px;
  }

  .qualification {
    padding: 16px;
    border-radius: 16px;
    background: var(--juya-color-primary-soft);

    p {
      margin: 8px 0 0;
      line-height: 1.7;
    }
  }

  .pending-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }

  @media (width <= 800px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

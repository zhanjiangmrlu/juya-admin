<script setup lang="ts">
import { computed, ref } from 'vue'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import { issueAction, issueFieldLabel, productionLabels } from './work-order-model'
const props = defineProps<{ order: WorkOrder; items: WorkItem[]; busy: boolean }>()
const emit = defineEmits<{ edit: [item: WorkItem, issue?: S['WorkIssue']]; resume: [id: string] }>()
const filter = ref('all')
const metrics = ['normal', 'review_required', 'failed', 'publishable'] as const
const rows = computed(() =>
  props.items
    .filter((item) => filter.value === 'all' || item.production_status === filter.value)
    .flatMap((item) => (item.issues || []).map((issue) => ({ item, issue })))
)
const /** 展示服务端具体问题位置
   * @param locations - 原文和字段的真实位置
   * @returns 可读位置
   */ locationLabel = (locations: string[]): string =>
    issueFieldLabel(locations) ||
    locations
      .map((location) =>
        /^\d+$/.test(location)
          ? `第 ${Number(location) + 1} 项`
          : (
              {
                dialogue: '句子',
                english: '英文',
                chinese: '中文',
                vocabulary: '词汇',
                chunks: '语块'
              } as Record<string, string>
            )[location] || location
      )
      .join(' · ') ||
    '篇目内容'
</script>
<template>
  <div class="work-overview">
    <div class="metrics">
      <article v-for="key in metrics" :key="key">
        <strong>{{ order.counts[key] }}</strong
        ><span>{{ key === 'publishable' ? '待发布' : productionLabels[key] }}</span>
      </article>
    </div>
    <ElRadioGroup v-model="filter" aria-label="问题范围筛选"
      ><ElRadioButton value="review_required"
        >需校对 {{ order.counts.review_required }}</ElRadioButton
      ><ElRadioButton value="all">全部问题</ElRadioButton
      ><ElRadioButton value="failed"
        >处理失败 {{ order.counts.failed }}</ElRadioButton
      ></ElRadioGroup
    >
    <AdminPanel title="异常篇目"
      ><ElTable :data="rows" empty-text="当前范围没有待处理问题">
        <ElTableColumn label="篇目" min-width="240"
          ><template #default="{ row }"
            ><strong>{{ row.item.title_en || row.item.title_zh || '等待解析正文' }}</strong
            ><small v-if="row.item.lifecycle_status === 'PUBLISHED'"
              >已发布内容的候选版本</small
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="问题位置" min-width="200"
          ><template #default="{ row }">{{
            locationLabel(row.issue.location || [])
          }}</template></ElTableColumn
        >
        <ElTableColumn label="问题" min-width="290"
          ><template #default="{ row }">{{ row.issue.message }}</template></ElTableColumn
        >
        <ElTableColumn label="修正入口" min-width="200"
          ><template #default="{ row }"
            ><ElButton
              link
              type="primary"
              :disabled="busy"
              @click="emit('edit', row.item, row.issue)"
              >{{ issueAction(row.issue.correction_target).label }}</ElButton
            ></template
          ></ElTableColumn
        >
      </ElTable></AdminPanel
    >
    <ElAlert title="待发布条件" type="info" :closable="false"
      >本批总计 {{ order.counts.total }} 篇。正常
      {{ order.counts.normal }} 篇完成抽样后可批量确认；{{
        order.counts.review_required
      }}
      篇需逐项修正；{{ order.counts.failed }} 篇处理失败可单独重试。未完成项目保留草稿。</ElAlert
    >
    <AdminPanel v-if="order.pending_commands?.length" title="仍在处理的操作"
      ><div v-for="pending in order.pending_commands" :key="pending.command_id">
        <span>操作结果待核实</span
        ><ElButton
          :disabled="busy || Date.parse(pending.retry_at) > Date.now()"
          @click="emit('resume', pending.command_id)"
          >继续核实结果</ElButton
        >
      </div></AdminPanel
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

  small {
    display: block;
    color: var(--juya-color-text-secondary);
  }

  @media (width <= 800px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

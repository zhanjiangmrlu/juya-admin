<script setup lang="ts">
/* global Blob, URL, document */
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'

import { ADMIN_SECTION_TITLES, ADMIN_TABLE_COLUMNS } from '@/app/admin-ui.config'
import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import DataTable from '@/components/data-table/data-table.vue'
import MetricChart from '@/components/metric-chart/metric-chart.vue'
import { createAnalyticsAdapter } from '@/features/analytics/analytics-adapter'
import {
  ACTIVITY_BASIS_LABELS,
  groupAnalyticsRows,
  METRIC_LABELS
} from '@/features/analytics/analytics-model'
import { useAnalytics } from '@/features/analytics/use-analytics'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AnalyticsPeriod, AnalyticsRow } from '@/features/analytics/analytics-model'

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
const dateRange = ref<[string, string] | null>([
  dayjs(today).subtract(29, 'day').format('YYYY-MM-DD'),
  today
])
const period = ref<AnalyticsPeriod>('day')
const controller = useAnalytics(createAnalyticsAdapter(useAdminApiClient()))
const loadedPeriod = ref<AnalyticsPeriod>('day')
const series = computed(() =>
  groupAnalyticsRows(
    controller.rows.value.filter(
      (row) => !/^(?:MODE_[35]_)?(?:NUMERATOR|DENOMINATOR)$/.test(row.dimension)
    ),
    loadedPeriod.value
  )
)

/**
 * 汇总可相加的指标；缺失数据保留为空
 *
 * @param metric - 已校验的指标名
 * @returns 汇总值或缺失占位
 */
function metricTotal(metric: string): number | string {
  const rows = controller.rows.value.filter((row) => row.metric === metric)
  const all = rows.filter((row) => row.dimension === 'ALL')
  const selected = all.length ? all : rows
  return selected.length ? selected.reduce((total, row) => total + row.value, 0) : '—'
}

/**
 * 取状态库存的最后统计日，避免跨日相加
 *
 * @param metric - 库存指标名
 * @param dimensions - 可展示的状态
 * @returns 末日库存或缺失占位
 */
function latestState(metric: string, dimensions: readonly string[]): number | string {
  const rows = controller.rows.value.filter((row) => row.metric === metric)
  const latestDay = rows
    .map((row) => row.day)
    .sort()
    .at(-1)
  const selected = rows.filter(
    (row: AnalyticsRow) => row.day === latestDay && dimensions.includes(row.dimension)
  )
  return selected.length ? selected.reduce((total, row) => total + row.value, 0) : '—'
}

const summaryMetrics = computed(() => [
  { label: '新增用户', value: metricTotal('NEW_USERS') },
  { label: '学习活跃统计', value: metricTotal('ACTIVE_USERS') },
  { label: '开放场景完成', value: metricTotal('OPEN_SCENE_COMPLETIONS') },
  {
    label: '反馈待处理',
    value: latestState('FEEDBACK_STATES', ['PENDING', 'PROCESSING', 'NEED_MORE', 'USER_SUPPLIED'])
  }
])
const feedbackResponseHours = computed(() => {
  const ratios = controller.ratios.value.filter(
    (row) => row.metric === 'FEEDBACK_RESPONSE_SECONDS' && !row.dimension
  )
  const denominator = ratios.reduce((total, row) => total + row.denominator, 0)
  const numerator = ratios.reduce((total, row) => total + row.numerator, 0)
  return denominator === 0 ? '—' : (numerator / denominator / 3600).toFixed(1) + ' 小时'
})
const overviewMetrics = computed(() => [
  { label: '三开放场景全部完成', value: metricTotal('OPEN_ALL_COMPLETIONS') },
  { label: '正式权益有效', value: latestState('FORMAL_STATES', ['ACTIVE']) },
  { label: '限时权益学习中', value: latestState('LIMITED_STATES', ['ACTIVE']) },
  {
    label: '平均首次响应时间',
    value: feedbackResponseHours.value
  }
])

onMounted(() => void handleLoad())
watch([period, dateRange], () => void handleLoad())

/**
 * 加载当前日期区间的匿名汇总统计
 *
 * @returns 加载完成后的 Promise
 */
async function handleLoad(): Promise<void> {
  if (!dateRange.value) return
  loadedPeriod.value = period.value
  await controller.load(dateRange.value[0], dateRange.value[1], period.value)
}

/**
 * 将已校验匿名统计下载为 JSON 文件
 *
 * @returns 无返回值
 */
function downloadRows(): void {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            period: loadedPeriod.value,
            activity_basis: controller.activityBasis.value,
            timezone: 'Asia/Shanghai',
            rows: controller.rows.value,
            ratios: controller.ratios.value
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    )
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `juya-analytics-${dateRange.value?.[0]}-${dateRange.value?.[1]}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="analytics-page">
    <div class="summary-metrics">
      <AdminPanel v-for="metric in summaryMetrics" :key="metric.label"
        ><span>{{ metric.label }}</span
        ><strong>{{ metric.value }}</strong></AdminPanel
      >
    </div>
    <div class="analytics-grid">
      <AdminPanel class="trend-card"
        ><template #header
          ><h2>学习与权益趋势</h2>
          <p>
            按{{ period === 'day' ? '日' : period === 'week' ? '周' : '月' }}汇总 ·
            查看来源与统计口径
          </p></template
        >
        <ElSkeleton v-if="controller.isLoading.value" :rows="5" animated />
        <ElEmpty v-else-if="!series.length" description="当前区间暂无趋势数据" />
        <MetricChart v-else :series="series" type="bar" />
      </AdminPanel>
      <AdminPanel
        :title="ADMIN_SECTION_TITLES.analytics.overviewCard"
        :heading="2"
        class="overview-card"
      >
        <dl>
          <div v-for="metric in overviewMetrics" :key="metric.label">
            <dt>{{ metric.label }}</dt>
            <dd>{{ metric.value }}</dd>
          </div>
        </dl>
        <p class="overview-note">状态库存取区间最后统计日；缺失指标保留为空。</p></AdminPanel
      >
    </div>
    <div class="query-heading">
      <h2>查询范围与统计口径</h2>
      <ElButton
        :disabled="!dateRange || controller.isLoading.value || controller.rows.value.length === 0"
        @click="downloadRows"
        >导出已校验数据</ElButton
      >
    </div>
    <AdminPanel>
      <div class="query-bar">
        <ElDatePicker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="起始日期"
          end-placeholder="结束日期"
          aria-label="统计日期范围"
        /><ElSelect v-model="period" aria-label="统计周期"
          ><ElOption label="按日" value="day" /><ElOption label="按周" value="week" /><ElOption
            label="按月"
            value="month" /></ElSelect
        ><ElButton
          :disabled="!dateRange"
          :loading="controller.isLoading.value"
          type="primary"
          @click="handleLoad"
          >查询统计</ElButton
        >
      </div>
      <ElAlert
        :closable="false"
        title="仅接受接口文档允许的匿名汇总指标，个人标识维度会被拒绝渲染和导出"
        type="info"
        show-icon
      />
      <ElAlert
        v-if="controller.error.value"
        class="error-alert"
        :closable="false"
        :title="controller.error.value"
        type="error"
        show-icon
      />
      <ElSkeleton v-if="controller.isLoading.value" :rows="5" animated />
      <ElEmpty
        v-else-if="controller.rows.value.length === 0"
        description="当前区间没有匿名汇总数据，可调整日期后重试"
      />

      <p v-if="controller.activityBasis.value" aria-label="活跃统计口径" class="metric-note">
        活跃统计口径：{{
          ACTIVITY_BASIS_LABELS[controller.activityBasis.value]
        }}。查询完整自然周或自然月可查看对应周期的独立人数。
      </p>
      <DataTable
        v-if="controller.ratios.value.length"
        :columns="ADMIN_TABLE_COLUMNS.analyticsRatios"
        :rows="controller.ratios.value"
        aria-label="统计比率口径"
      >
        <template #metric="{ row }">{{ METRIC_LABELS[row.metric] }}</template>

        <template #rate="{ row }">{{
          row.rate === null
            ? '无分母'
            : row.unit === 'seconds'
              ? `${row.rate.toFixed(1)} 秒`
              : `${(row.rate * 100).toFixed(1)}%`
        }}</template>
      </DataTable>
      <p class="metric-note">
        按北京时间自然日、周一开始的自然周与自然月汇总，首尾周期仅包含查询区间；缺失统计显示为空，不补零。比率使用累计分子
        / 累计分母。状态库存按区间最后一天展示，历史状态变更按动作计数。
      </p>
    </AdminPanel>
  </section>
</template>

<style scoped lang="scss">
.analytics-page {
  padding-top: 6px;

  .summary-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 15px;
    margin-bottom: 23px;
    padding-right: 23px;
  }

  .summary-metrics .el-card {
    min-height: 128px;
  }

  .summary-metrics .el-card:where(:first-child) {
    background: #eaf2e3;
  }

  .summary-metrics span {
    display: block;
    margin-bottom: 20px;
    color: var(--juya-color-text-regular);
    font-size: 13px;
  }

  .summary-metrics strong {
    font-size: 33px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  .analytics-grid {
    display: grid;
    grid-template-columns: minmax(0, 704fr) minmax(0, 438fr);
    gap: 18px;
  }

  .trend-card,
  .overview-card {
    min-height: 448px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
  }

  .trend-card p,
  .overview-note {
    margin: 8px 0 0;
    color: var(--juya-color-text-regular);
    font-size: 13px;
  }

  .overview-card dl {
    margin: 0;
  }

  .overview-card dl > div {
    display: flex;
    min-height: 78px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--juya-color-border-light);
  }

  .overview-card dt {
    font-size: 14px;
  }

  .overview-card dd {
    margin: 0;
    color: var(--juya-color-brand-accent);
    font-size: 20px;
    font-weight: 700;
    white-space: nowrap;
  }

  .query-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 24px 0 12px;
  }

  .query-heading h2 {
    font-size: 17px;
  }

  .query-bar {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) 130px auto;
    gap: 10px;
    margin-bottom: 14px;
  }

  .error-alert {
    margin-top: 14px;
  }

  .metric-note {
    margin: 14px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
  }

  @media (width <= 1080px) {
    .analytics-grid {
      grid-template-columns: 1fr;
    }

    .summary-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding-right: 0;
    }
  }

  @media (width <= 900px) {
    .query-bar {
      grid-template-columns: 1fr;
    }
  }
}
</style>

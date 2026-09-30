<script setup lang="ts">
/* global Blob, URL, document */
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'

import MetricChart from '@/components/metric-chart/metric-chart.vue'
import { createAnalyticsAdapter } from '@/features/analytics/analytics-adapter'
import { groupAnalyticsRows, METRIC_LABELS } from '@/features/analytics/analytics-model'
import { useAnalytics } from '@/features/analytics/use-analytics'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type { AnalyticsPeriod } from '@/features/analytics/analytics-model'

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
    controller.rows.value.filter((row) => !['NUMERATOR', 'DENOMINATOR'].includes(row.dimension)),
    loadedPeriod.value
  )
)

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
    <div class="page-heading">
      <div>
        <span>A25</span>
        <h2>匿名汇总统计</h2>
      </div>
      <ElButton
        :disabled="!dateRange || controller.isLoading.value || controller.rows.value.length === 0"
        @click="downloadRows"
        >导出已校验数据</ElButton
      >
    </div>
    <ElCard shadow="never">
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
      <MetricChart v-else-if="series.length" :series="series" />
      <ElTable
        v-if="controller.ratios.value.length"
        :data="controller.ratios.value"
        aria-label="统计比率口径"
      >
        <ElTableColumn prop="day" label="周期起始日" width="120" />
        <ElTableColumn label="指标" width="140"
          ><template #default="{ row }">{{ METRIC_LABELS[row.metric] }}</template></ElTableColumn
        >
        <ElTableColumn prop="numerator" label="分子" width="80" />
        <ElTableColumn prop="denominator" label="分母" width="80" />
        <ElTableColumn label="比率" width="110"
          ><template #default="{ row }">{{
            row.rate === null ? '无分母' : `${(row.rate * 100).toFixed(1)}%`
          }}</template></ElTableColumn
        >
        <ElTableColumn prop="basis" label="口径" min-width="240" />
      </ElTable>
      <p class="metric-note">
        按北京时间自然日、周一开始的自然周与自然月汇总，首尾周期仅包含查询区间。活跃用户跨日合计为人次，未去重；缺失统计显示为空，不补零。比率使用累计分子
        / 累计分母。
      </p>
    </ElCard>
  </section>
</template>

<style scoped lang="scss">
.analytics-page {
  .page-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;

    span {
      color: var(--juya-color-text-primary);
      font-size: 11px;
      font-weight: 700;
    }

    h2 {
      margin: 3px 0 0;
      color: var(--juya-color-sidebar);
      font-size: 18px;
    }
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
    margin: 10px 0 0;
    color: var(--juya-color-text-secondary);
    font-size: 12px;
    text-align: center;
  }

  @media (width <= 900px) {
    .query-bar {
      grid-template-columns: 1fr;
    }
  }
}
</style>

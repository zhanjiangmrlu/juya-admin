<script setup lang="ts">
/* global Blob, URL, document */
import dayjs from 'dayjs'
import { computed, ref } from 'vue'

import MetricChart from '@/components/metric-chart/metric-chart.vue'
import { createAnalyticsAdapter } from '@/features/analytics/analytics-adapter'
import { groupAnalyticsRows } from '@/features/analytics/analytics-model'
import { useAnalytics } from '@/features/analytics/use-analytics'
import { createApiClient } from '@/services/api/api-client'

import type { AnalyticsPeriod } from '@/features/analytics/analytics-model'

const dateRange = ref<[string, string]>([
  dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])
const period = ref<AnalyticsPeriod>('day')
const controller = useAnalytics(createAnalyticsAdapter(createApiClient()))
const series = computed(() => groupAnalyticsRows(controller.rows.value, period.value))

/**
 * 加载当前日期区间的匿名汇总统计
 *
 * @returns 加载完成后的 Promise
 */
async function handleLoad(): Promise<void> {
  await controller.load(dateRange.value[0], dateRange.value[1])
}

/**
 * 将已校验匿名统计下载为 JSON 文件
 *
 * @returns 无返回值
 */
function downloadRows(): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(controller.rows.value, null, 2)], { type: 'application/json' })
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `juya-analytics-${dateRange.value[0]}-${dateRange.value[1]}.json`
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
      <ElButton :disabled="controller.rows.value.length === 0" @click="downloadRows"
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
        /><ElSelect v-model="period"
          ><ElOption label="按日" value="day" /><ElOption label="按周" value="week" /><ElOption
            label="按月"
            value="month" /></ElSelect
        ><ElButton :loading="controller.isLoading.value" type="primary" @click="handleLoad"
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
      <ElEmpty v-if="controller.rows.value.length === 0" description="请选择日期并查询匿名统计" />
      <MetricChart v-else :series="series" />
      <p class="metric-note">
        图表展示接口原始计数；比率指标必须同时提供分子、分母或明确口径后方可展示
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

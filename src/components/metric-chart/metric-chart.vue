<script setup lang="ts">
/* global HTMLDivElement, ResizeObserver */
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AnalyticsSeries } from '@/features/analytics/analytics-model'
import type { ECharts } from 'echarts/core'

const props = withDefaults(
  defineProps<{ series: readonly AnalyticsSeries[]; type?: 'bar' | 'line' }>(),
  { type: 'line' }
)
const container = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

use([BarChart, CanvasRenderer, GridComponent, LegendComponent, LineChart, TooltipComponent])

/**
 * 根据最新统计序列更新图表
 *
 * @returns 无返回值
 */
function renderChart(): void {
  if (!chart) return
  const xAxis = [...new Set(props.series.flatMap((item) => item.xAxis))].sort()
  chart.setOption(
    {
      animation: false,
      color: ['#326b44', '#91b782', '#b37b32', '#748678', '#b85240'],
      legend: { data: props.series.map((item) => item.label), type: 'scroll' },
      grid: { bottom: 36, containLabel: true, left: 16, right: 20, top: 48 },
      series: props.series.map((item) => ({
        data: item.values,
        name: item.label,
        showSymbol: true,
        smooth: true,
        type: props.type,
        barMaxWidth: 35,
        itemStyle: { borderRadius: [5, 5, 0, 0] }
      })),
      tooltip: { trigger: 'axis' },
      xAxis: { data: xAxis, type: 'category' },
      yAxis: { minInterval: 1, type: 'value' }
    },
    { notMerge: true }
  )
}

/**
 * 初始化图表和尺寸观察器
 *
 * @returns 无返回值
 */
function mountChart(): void {
  if (!container.value) return
  chart = init(container.value)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(container.value)
  renderChart()
}

/**
 * 销毁图表和尺寸观察器
 *
 * @returns 无返回值
 */
function disposeChart(): void {
  observer?.disconnect()
  chart?.dispose()
  observer = null
  chart = null
}

watch(() => props.series, renderChart, { deep: true })
onMounted(mountChart)
onBeforeUnmount(disposeChart)
</script>

<template>
  <div ref="container" class="metric-chart" role="img" aria-label="匿名汇总指标趋势图"></div>
</template>

<style scoped lang="scss">
.metric-chart {
  width: 100%;
  min-height: 360px;
}
</style>

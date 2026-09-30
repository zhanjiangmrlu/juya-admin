import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MetricChart from './metric-chart.vue'

const { setOption } = vi.hoisted(() => ({ setOption: vi.fn() }))
vi.mock('echarts/core', () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption }),
  use: vi.fn()
}))

describe('metric chart', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setOption.mockClear()
  })

  it('shows named series without initially hiding a single point behind animation', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
    const wrapper = mount(MetricChart, {
      props: { series: [{ label: '新增用户 · 全部', values: [12], xAxis: ['2026-09-30'] }] }
    })
    expect(setOption).toHaveBeenCalledWith(
      expect.objectContaining({
        animation: false,
        legend: { data: ['新增用户 · 全部'], type: 'scroll' },
        series: [expect.objectContaining({ data: [12], showSymbol: true })]
      }),
      { notMerge: true }
    )
    wrapper.unmount()
  })
})

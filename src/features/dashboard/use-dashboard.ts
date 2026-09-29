import { computed, type ComputedRef, type Ref, ref } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { DashboardAdapter, DashboardSnapshotDto, WorkItemDto } from './dashboard-adapter'

import { groupWorkItems, type WorkItemGroups } from '../work-items/work-item-model'

export interface DashboardController {
  error: Ref<string | null>
  groupedWorkItems: ComputedRef<WorkItemGroups>
  isLoading: Ref<boolean>
  lastUpdatedAt: Ref<Date | null>
  load(): Promise<void>
  snapshot: Ref<DashboardSnapshotDto | null>
  start(): void
  stop(): void
  workItems: Ref<WorkItemDto[]>
}

export interface DashboardOptions {
  document?: Document
  pollIntervalMs?: number
}

/**
 * 创建带轮询、取消和页面可见性控制的工作台状态
 *
 * @param adapter - 工作台 API 适配器
 * @param options - 可选文档对象和轮询周期
 * @returns 工作台响应式控制器
 */
export function useDashboard(
  adapter: DashboardAdapter,
  options: DashboardOptions = {}
): DashboardController {
  const activeDocument = options.document ?? globalThis.document
  const pollIntervalMs = options.pollIntervalMs ?? 30_000
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const lastUpdatedAt = ref<Date | null>(null)
  const snapshot = ref<DashboardSnapshotDto | null>(null)
  const workItems = ref<WorkItemDto[]>([])
  const groupedWorkItems = computed(() => groupWorkItems(workItems.value))
  let abortController: AbortController | null = null
  let intervalId: ReturnType<typeof globalThis.setInterval> | null = null
  let requestSequence = 0
  let started = false

  /**
   * 同时刷新工作台快照与待办，新的刷新会取消旧请求
   *
   * @returns 刷新完成后的 Promise
   */
  async function load(): Promise<void> {
    abortController?.abort()
    abortController = new AbortController()
    const currentSequence = ++requestSequence
    isLoading.value = snapshot.value === null
    error.value = null

    try {
      const [nextSnapshot, nextWorkItems] = await Promise.all([
        adapter.getSnapshot(abortController.signal),
        adapter.getWorkItems(abortController.signal)
      ])
      if (currentSequence !== requestSequence) return
      snapshot.value = nextSnapshot
      workItems.value = nextWorkItems
      lastUpdatedAt.value = new Date()
    } catch (reason) {
      if (currentSequence !== requestSequence || isAbortError(reason)) return
      error.value = reason instanceof ApiError ? reason.message : '工作台数据加载失败，请稍后重试'
    } finally {
      if (currentSequence === requestSequence) isLoading.value = false
    }
  }

  /**
   * 清除现有轮询定时器
   *
   * @returns 无返回值
   */
  function clearPolling(): void {
    if (intervalId === null) return
    globalThis.clearInterval(intervalId)
    intervalId = null
  }

  /**
   * 在页面可见时创建 30 秒轮询
   *
   * @returns 无返回值
   */
  function schedulePolling(): void {
    clearPolling()
    if (activeDocument.hidden) return
    intervalId = globalThis.setInterval(() => void load(), pollIntervalMs)
  }

  /**
   * 根据页面可见性暂停或恢复请求与轮询
   *
   * @returns 无返回值
   */
  function handleVisibilityChange(): void {
    if (activeDocument.hidden) {
      abortController?.abort()
      clearPolling()
      return
    }
    void load()
    schedulePolling()
  }

  /**
   * 启动工作台首次加载、可见性监听和轮询
   *
   * @returns 无返回值
   */
  function start(): void {
    if (started) return
    started = true
    activeDocument.addEventListener('visibilitychange', handleVisibilityChange)
    if (!activeDocument.hidden) {
      void load()
      schedulePolling()
    }
  }

  /**
   * 停止工作台轮询并取消当前请求
   *
   * @returns 无返回值
   */
  function stop(): void {
    if (!started) return
    started = false
    activeDocument.removeEventListener('visibilitychange', handleVisibilityChange)
    abortController?.abort()
    clearPolling()
  }

  return {
    error,
    groupedWorkItems,
    isLoading,
    lastUpdatedAt,
    load,
    snapshot,
    start,
    stop,
    workItems
  }
}

/**
 * 判断未知异常是否为浏览器请求取消异常
 *
 * @param error - 捕获到的未知异常
 * @returns 异常名称是否为 AbortError
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

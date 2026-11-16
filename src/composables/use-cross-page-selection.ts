import { ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'

import type { Ref } from 'vue'

/** 为免费集合生成不含页码的条件键
 * @param module 当前内容模块路径
 * @param query 受控搜索、筛选及排序条件
 * @returns 稳定查询条件键
 */
export const freeSelectionQueryKey = (module: string, query: Record<string, unknown>) =>
  JSON.stringify([
    module,
    ...['search', 'q', 'status', 'category_id', 'content_type', 'batch_id', 'sort'].map((key) =>
      String(query[key] || '')
    )
  ])

/** 提示丢弃尚未提交的跨页选择
 * @returns 是否明确确认清空
 */
const confirmDiscard = async () => {
  try {
    await ElMessageBox.confirm('此操作将清空已选择的免费设置内容，是否继续？', '清空跨页选择', {
      confirmButtonText: '清空并继续',
      cancelButtonText: '保留选择',
      type: 'warning'
    })
    return true
  } catch {
    return false
  }
}

/** 管理独立免费模式中的稳定ID集合，绝不恢复未提交选择
 * @param rows 当前页内容，仅用于交集和本页选择
 * @param page 当前有效页码，用于记录首次选中页
 * @param confirm 用户明确确认清空的交互端口
 * @param owner 当前管理员身份，用于废弃跨账号的迟到确认
 * @returns 免费模式与跨页选择操作
 */
export const useCrossPageSelection = (
  rows: Ref<{ id: string }[]>,
  page: Ref<number>,
  confirm = confirmDiscard,
  owner?: Ref<string>
) => {
  const active = ref(false),
    selectedPages = ref<Record<string, number>>({})
  let ownerGeneration = 0
  const ids = computed(() => Object.keys(selectedPages.value))
  const pageIds = computed(() => rows.value.map((item) => item.id))
  const intersection = computed(() => pageIds.value.filter((id) => ids.value.includes(id)))
  const allSelected = computed(
    () => pageIds.value.length > 0 && intersection.value.length === pageIds.value.length
  )
  const partialSelected = computed(() => intersection.value.length > 0 && !allSelected.value)
  const pageCount = computed(() => new Set(Object.values(selectedPages.value)).size)
  /** 清空当前免费选择 */
  const clear = () => {
    selectedPages.value = {}
  }
  if (owner)
    watch(
      owner,
      () => {
        ownerGeneration++
        clear()
        active.value = false
      },
      { flush: 'sync' }
    )
  /** 进入独立免费选择模式 */
  const enter = () => {
    clear()
    active.value = true
  }
  /** 选择或取消一个稳定内容
   * @param id 内容稳定标识
   * @param checked 是否选中
   */
  const toggle = (id: string, checked: boolean) => {
    if (checked) selectedPages.value[id] ??= page.value
    else delete selectedPages.value[id]
  }
  /** 仅改变当前页集合
   * @param checked 当前页是否全选
   */
  const togglePage = (checked: boolean) => {
    for (const id of pageIds.value) toggle(id, checked)
  }
  /** 仅确认允许丢弃，查询及导航提交前保留原集合
   * @returns 当前管理员是否仍明确允许改变条件
   */
  const canDiscard = async () => {
    const run = ownerGeneration
    const allowed = !ids.value.length || (await confirm())
    return run === ownerGeneration && allowed
  }
  /** 有选择时先提示，取消不改变任何条件或选择
   * @returns 是否可以继续条件变更
   */
  const discard = async () => {
    const run = ownerGeneration
    if (!(await canDiscard()) || run !== ownerGeneration) return false
    clear()
    return true
  }
  /** 确认后退出并清空免费集合
   * @returns 是否实际退出
   */
  const exit = async () => {
    const run = ownerGeneration
    if (!(await discard()) || run !== ownerGeneration) return false
    active.value = false
    return true
  }
  /** 完成后仅保留明确失败项
   * @param failed 原任务返回的失败稳定ID
   */
  const retainFailures = (failed: string[]) => {
    selectedPages.value = Object.fromEntries(
      failed.map((id) => [id, selectedPages.value[id] || page.value])
    )
  }
  return {
    active,
    ids,
    pageCount,
    allSelected,
    partialSelected,
    toggle,
    togglePage,
    clear,
    enter,
    canDiscard,
    discard,
    exit,
    retainFailures
  }
}

import { onBeforeUnmount, type Ref, ref, type ShallowRef, shallowRef } from 'vue'

/** 管理页面真实数据请求，过期响应不覆盖新条件
 * @param load 查询当前条件的函数
 * @returns 可保留可信旧快照的加载状态
 */
export const useResource = <T>(
  load: () => Promise<T>
): {
  data: ShallowRef<T | null>
  busy: Ref<boolean>
  error: Ref<string>
  refresh: () => Promise<void>
} => {
  const data = shallowRef<T | null>(null),
    busy = ref(false),
    error = ref('')
  let generation = 0
  /** 刷新当前条件并忽略已过期的响应 */
  const refresh = async () => {
    const run = ++generation
    busy.value = true
    error.value = ''
    try {
      const value = await load()
      if (run === generation) data.value = value
    } catch (reason) {
      if (run === generation)
        error.value = reason instanceof Error ? reason.message : '暂未获取，请重试'
    } finally {
      if (run === generation) busy.value = false
    }
  }
  onBeforeUnmount(() => {
    generation++
  })
  return { data, busy, error, refresh }
}

import type { MediaWaitOptions, ProcessingMedia } from '@/shared/types/media'

/** 有限等待已接收素材，页面离开后停止查询并保留原素材编号
 * @param initial 已经接收的素材快照
 * @param read 获取同一素材最新处理状态
 * @param options 页面存活判断、等待策略与最大查询次数
 * @returns 已确认的最新状态，超时保留已接收的素材编号
 */
export const waitForMedia = async <T extends ProcessingMedia>(
  initial: T,
  read: () => Promise<T>,
  options: MediaWaitOptions
): Promise<T> => {
  let current = initial
  const pause = options.pause || (() => new Promise<void>((resolve) => setTimeout(resolve, 1000)))
  for (let count = 0; count < (options.checks ?? 20); count++) {
    if (!options.active() || ['ready', 'failed'].includes(current.state)) break
    await pause()
    if (!options.active()) break
    const latest = await read()
    if (!options.active()) break
    current = latest
  }
  return current
}

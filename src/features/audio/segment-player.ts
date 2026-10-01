import { readonly, ref } from 'vue'
export type AudioElement = HTMLAudioElement

/** 管理同一个播放器，避免句子与词条音频重叠。
 * @param audio - 页面唯一音频元素
 * @returns 片段播放器及销毁方法
 */
export function createSegmentPlayer(audio: HTMLAudioElement) {
  const activeId = ref<string | null>(null)
  let endTime: number | null = null
  let generation = 0
  /** 清除片段截止点。 */
  function clear(): void {
    activeId.value = null
    endTime = null
  }
  /** 到达片段截止点时暂停。 */
  function monitor(): void {
    if (endTime !== null && audio.currentTime >= endTime) stop()
  }
  /** 暂停并清理当前片段。 */
  function stop(): void {
    generation++
    clear()
    audio.pause()
  }
  /** 从指定时间播放音频片段。
   * @param id - 当前播放对象
   * @param url - 签名音频地址
   * @param startMs - 起始毫秒
   * @param endMs - 截止毫秒
   */
  async function play(
    id: string,
    url: string,
    startMs = 0,
    endMs: number | null = null
  ): Promise<void> {
    stop()
    const current = generation
    if (audio.getAttribute?.('src') !== url) audio.src = url
    audio.currentTime = startMs / 1000
    activeId.value = id
    endTime = endMs === null ? null : endMs / 1000
    try {
      await audio.play()
    } catch (failure) {
      if (current === generation) clear()
      throw failure
    }
  }
  /** 忽略切换片段后延迟抵达的旧暂停事件。 */
  function handlePause(): void {
    if (audio.paused !== false) clear()
  }
  /** 释放页面音频监听。 */
  function dispose(): void {
    stop()
    audio.removeEventListener('timeupdate', monitor)
    audio.removeEventListener('pause', handlePause)
    audio.removeEventListener('ended', clear)
  }
  audio.addEventListener('timeupdate', monitor)
  audio.addEventListener('pause', handlePause)
  audio.addEventListener('ended', clear)
  return { activeId: readonly(activeId), play, stop, dispose }
}

import { computed, readonly, ref } from 'vue'
export type AudioElement = HTMLAudioElement
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
const mountedPlayers = new Set<() => void>()

/**
 * 同一元素负责整段、片段和词条播放，保留暂停位置并隔离过期请求。
 * @param audio - 页面唯一音频元素
 * @returns 响应式播放器和释放方法
 */
export function createSegmentPlayer(audio: HTMLAudioElement) {
  const activeId = ref<string | null>(null)
  const status = ref<PlaybackStatus>('idle')
  const currentMs = ref(0)
  const error = ref('')
  let endTime: number | null = null
  let generation = 0
  let source = ''
  let start = 0
  let pendingSeek: number | null = null

  /** 停止播放并释放当前片段状态。 */
  function stop(): void {
    generation++
    activeId.value = null
    endTime = null
    pendingSeek = null
    status.value = 'idle'
    audio.pause()
  }
  /**
   * 装载绑定源且不自动起播。
   * @param url - 已签名素材地址
   */
  function load(url: string): void {
    stop()
    error.value = ''
    source = url
    if (url) audio.src = url
    else audio.removeAttribute?.('src')
    currentMs.value = 0
    audio.load?.()
  }
  /**
   * 设置播放位置并保留尚未装载时的定位请求。
   * @param seconds - 定位秒数
   */
  function seek(seconds: number): void {
    if (audio.readyState === 0) {
      pendingSeek = seconds
      return
    }
    try {
      audio.currentTime = seconds
      pendingSeek = null
    } catch {
      pendingSeek = seconds
    }
  }
  /** 媒体元数据就绪后完成延迟定位。 */
  function metadata(): void {
    if (pendingSeek !== null) seek(pendingSeek)
  }
  /** 更新当前毫秒并在片段末尾停止。 */
  function monitor(): void {
    currentMs.value = Math.round((audio.currentTime || 0) * 1000)
    if (pendingSeek === null && endTime !== null && audio.currentTime >= endTime) finish()
  }
  /** 标记自然结束或区间结束。 */
  function finish(): void {
    stop()
    status.value = 'ended'
  }
  /** 保留区间和当前位置以继续播放。 */
  function pause(): void {
    generation++
    audio.pause()
    if (activeId.value) status.value = 'paused'
  }
  /**
   * 切换片段或暂停续播同一对象。
   * @param id - 稳定播放对象或版本编号
   * @param url - 已签名素材地址
   * @param startMs - 片段开始毫秒
   * @param endMs - 片段结束毫秒
   */
  async function play(
    id: string,
    url: string,
    startMs = 0,
    endMs: number | null = null
  ): Promise<void> {
    for (const stopOther of mountedPlayers) if (stopOther !== stop) stopOther()
    const same =
      activeId.value === id &&
      source === url &&
      start === startMs &&
      endTime === (endMs === null ? null : endMs / 1000)
    if (same && (status.value === 'playing' || status.value === 'loading')) {
      pause()
      return
    }
    const resume = same && status.value === 'paused'
    if (!resume) {
      stop()
      if (source !== url) {
        source = url
        audio.src = url
        audio.load?.()
      }
      seek(startMs / 1000)
      start = startMs
      endTime = endMs === null ? null : endMs / 1000
    }
    const current = ++generation
    activeId.value = id
    error.value = ''
    status.value = 'loading'
    try {
      await audio.play()
      if (current === generation) status.value = 'playing'
    } catch (failure) {
      if (current !== generation) return
      status.value = 'error'
      error.value = '播放失败，请重试或刷新音频地址'
      throw failure
    }
  }
  /** 同步普通播放器的暂停事件。 */
  function handlePause(): void {
    if (activeId.value && audio.paused !== false && status.value !== 'error')
      status.value = 'paused'
  }
  /** 显示音频缓冲状态。 */
  function waiting(): void {
    if (activeId.value && status.value !== 'paused') status.value = 'loading'
  }
  /** 同步普通播放器状态并停止其他音频。 */
  function playing(): void {
    if (audio.paused === true) return
    for (const stopOther of mountedPlayers) if (stopOther !== stop) stopOther()
    if (!activeId.value && source) {
      activeId.value = 'scene'
      start = 0
      endTime = null
    }
    if (activeId.value) status.value = 'playing'
  }
  /** 保留失败对象供重试。 */
  function failed(): void {
    generation++
    status.value = 'error'
    error.value = '播放失败，请重试或刷新音频地址'
  }
  /**
   * 返回同一控件的可访问播放动作。
   * @param id - 稳定播放对象或版本编号
   * @returns 当前状态对应的可访问动作文字
   */
  function label(id: string): string {
    if (activeId.value !== id) return '播放'
    return {
      idle: '播放',
      loading: '加载中 · 取消',
      playing: '暂停',
      paused: '继续播放',
      ended: '重播',
      error: '重试播放'
    }[status.value]
  }
  const listeners = {
    timeupdate: monitor,
    loadedmetadata: metadata,
    pause: handlePause,
    ended: finish,
    waiting,
    playing,
    error: failed
  }
  mountedPlayers.add(stop)
  for (const [name, listener] of Object.entries(listeners)) audio.addEventListener(name, listener)
  /** 释放播放器及全局防叠播登记。 */
  function dispose(): void {
    stop()
    mountedPlayers.delete(stop)
    for (const [name, listener] of Object.entries(listeners))
      audio.removeEventListener(name, listener)
  }
  return {
    activeId: readonly(activeId),
    status: readonly(status),
    statusText: computed(
      () =>
        ({
          idle: '待播放',
          loading: '加载中',
          playing: '播放中',
          paused: '已暂停',
          ended: '播放结束',
          error: '播放失败'
        })[status.value]
    ),
    currentMs: readonly(currentMs),
    error: readonly(error),
    label,
    load,
    play,
    pause,
    stop,
    dispose
  }
}

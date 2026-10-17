import { onBeforeUnmount, ref } from 'vue'

import { claimAudioFocus, registerAudioFocus } from '@/services/audio-focus'

/** 使用手势中恢复的Web Audio上下文，让异步生成完成后仍可开始试听
 * @param load 获取已保存受控词汇的音频，active用于停止旧查询
 * @returns 当前词汇、状态、错误和播放控制
 */
export const useWordPronunciation = (
  load: (id: string, active: () => boolean) => Promise<string>
) => {
  const current = ref(''),
    status = ref('idle'),
    error = ref('')
  const owner = {}
  let context: AudioContext | null = null,
    source: AudioBufferSourceNode | null = null,
    alive = true,
    generation = 0
  /** 停止当前词汇并使所有晚响应失效 */
  const stop = () => {
    generation++
    source?.stop()
    source = null
    status.value = 'idle'
    error.value = ''
    current.value = ''
  }
  const release = registerAudioFocus(owner, stop)
  /** 用户主动点击后开始同一词汇的受控试听
   * @param id 保存版本内的词汇编号
   */
  const play = async (id: string) => {
    if (!alive || (current.value === id && status.value === 'loading')) return
    stop()
    claimAudioFocus(owner)
    const run = ++generation
    /** 只有当前页面中的最新词汇请求可以继续
     * @returns 请求是否仍然有效
     */
    const active = () => alive && generation === run
    current.value = id
    status.value = 'loading'
    try {
      context ||= new AudioContext()
      await context.resume()
      const url = await load(id, active)
      if (!active()) return
      const response = await fetch(url, { credentials: 'include' })
      if (response.status === 401) window.dispatchEvent(new Event('admin-session-expired'))
      if (!response.ok) throw new Error('发音暂不可用')
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (!active()) return
      source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        if (active()) {
          status.value = 'idle'
          source = null
        }
      }
      source.start()
      status.value = 'playing'
    } catch {
      if (active()) {
        status.value = 'error'
        error.value = '发音暂不可用，点击重试'
      }
    }
  }
  onBeforeUnmount(() => {
    alive = false
    stop()
    release()
    void context?.close()
  })
  return { current, status, error, play, stop }
}

const listeners = new Map<object, () => void>()
/** 注册可暂停的播放器
 * @param owner 本播放器的稳定实例
 * @param stop 失去焦点时停止播放的动作
 * @returns 释放监听的函数
 */
export const registerAudioFocus = (owner: object, stop: () => void) => {
  listeners.set(owner, stop)
  return () => listeners.delete(owner)
}
/** 新播放器开始时暂停其他完整音频和词汇音轨
 * @param owner 用户刚操作的播放器
 */
export const claimAudioFocus = (owner: object) => {
  document.querySelectorAll('audio').forEach((audio) => {
    if (audio !== owner) audio.pause()
  })
  for (const [identity, stop] of listeners) if (identity !== owner) stop()
}
/** 捕获原生完整音频的播放事件，统一抢占词汇和其他播放器
 * @returns 移除页面播放监听
 */
export const installAudioFocus = () => {
  /** 将原生播放事件交给统一焦点管理
   * @param event 刚开始播放的原生媒体事件
   */
  const play = (event: Event) => {
    if (event.target instanceof HTMLAudioElement) claimAudioFocus(event.target)
  }
  document.addEventListener('play', play, true)
  return () => document.removeEventListener('play', play, true)
}
